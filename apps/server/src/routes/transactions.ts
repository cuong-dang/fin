import { schema } from "../db";
import {
  type EnrichedTransaction,
  adjustmentUpdateBody,
  idParam,
  processTransactionBody,
  transactionBody,
  type TransactionsListResponse,
} from "@fin/schemas";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../db";
import { findOwned } from "../lib/authz";
import { groupBy } from "../lib/collections";
import { parseMoney } from "../lib/money";
import { insertLegsAndLines } from "../lib/transactions-write";

const PAGE_LIMIT = 100;

const listQuery = z.object({ accountId: z.uuid().optional() });

export const transactionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // ─── List ────────────────────────────────────────────────────────────────

  app.get("/", async (req): Promise<TransactionsListResponse> => {
    const { accountId } = listQuery.parse(req.query);

    const filteredTxIds = accountId
      ? db
          .select({ id: schema.transactionLegs.transactionId })
          .from(schema.transactionLegs)
          .where(eq(schema.transactionLegs.accountId, accountId))
      : undefined;

    const baseWhere = and(
      eq(schema.transactions.groupId, req.auth.groupId),
      filteredTxIds
        ? inArray(schema.transactions.id, filteredTxIds)
        : undefined,
    );

    const [pendingRows, completedRows] = await Promise.all([
      db
        .select()
        .from(schema.transactions)
        .where(and(baseWhere, isNull(schema.transactions.date)))
        .orderBy(asc(schema.transactions.createdAt)),
      db
        .select()
        .from(schema.transactions)
        .where(and(baseWhere, isNotNull(schema.transactions.date)))
        .orderBy(
          desc(schema.transactions.date),
          desc(schema.transactions.createdAt),
        )
        .limit(PAGE_LIMIT),
    ]);

    const allRows = [...pendingRows, ...completedRows];
    if (allRows.length === 0) return { pending: [], completed: [] };
    const txIds = allRows.map((t) => t.id);

    const [legRows, lineRows] = await Promise.all([
      db
        .select({
          transactionId: schema.transactionLegs.transactionId,
          accountId: schema.transactionLegs.accountId,
          accountName: schema.accounts.name,
          accountCurrency: schema.accounts.currency,
          amount: schema.transactionLegs.amount,
        })
        .from(schema.transactionLegs)
        .innerJoin(
          schema.accounts,
          eq(schema.accounts.id, schema.transactionLegs.accountId),
        )
        .where(inArray(schema.transactionLegs.transactionId, txIds)),
      db
        .select({
          transactionId: schema.transactionLines.transactionId,
          amount: schema.transactionLines.amount,
          currency: schema.transactionLines.currency,
          categoryId: schema.transactionLines.categoryId,
          categoryName: schema.categories.name,
          subcategoryId: schema.transactionLines.subcategoryId,
          subcategoryName: schema.subcategories.name,
          tagId: schema.transactionLines.tagId,
          tagName: schema.tags.name,
        })
        .from(schema.transactionLines)
        .innerJoin(
          schema.categories,
          eq(schema.categories.id, schema.transactionLines.categoryId),
        )
        .leftJoin(
          schema.subcategories,
          eq(schema.subcategories.id, schema.transactionLines.subcategoryId),
        )
        .leftJoin(
          schema.tags,
          eq(schema.tags.id, schema.transactionLines.tagId),
        )
        .where(inArray(schema.transactionLines.transactionId, txIds)),
    ]);

    const legsByTx = groupBy(legRows, (l) => l.transactionId);
    const linesByTx = groupBy(lineRows, (l) => l.transactionId);

    // JSON can't carry bigint, so amounts are stringified.
    const enrich = (t: (typeof allRows)[number]): EnrichedTransaction => ({
      id: t.id,
      date: t.date,
      createdAt: t.createdAt.toISOString(),
      type: t.type,
      description: t.description,
      legs: (legsByTx.get(t.id) ?? []).map((l) => ({
        accountId: l.accountId,
        accountName: l.accountName,
        accountCurrency: l.accountCurrency,
        amount: l.amount.toString(),
      })),
      lines: (linesByTx.get(t.id) ?? []).map((l) => ({
        amount: l.amount.toString(),
        currency: l.currency,
        categoryId: l.categoryId,
        categoryName: l.categoryName,
        subcategoryId: l.subcategoryId,
        subcategoryName: l.subcategoryName,
        tagId: l.tagId,
        tagName: l.tagName,
      })),
    });

    return {
      pending: pendingRows.map(enrich),
      completed: completedRows.map(enrich),
    };
  });

  // ─── Create ─────────────────────────────────────────────────────────────

  app.post("/", async (req, reply) => {
    const body = transactionBody.parse(req.body);

    const sourceAccount = await findOwned(
      schema.accounts,
      body.accountId,
      req.auth.groupId,
    );
    if (!sourceAccount)
      return reply.code(404).send({ error: "Account not found" });

    const result = await db.transaction(async (tx) => {
      const [txRow] = await tx
        .insert(schema.transactions)
        .values({
          groupId: req.auth.groupId,
          userId: req.auth.userId,
          date: body.pending ? null : (body.date ?? null),
          type: body.type,
          description: body.description ?? null,
        })
        .returning({ id: schema.transactions.id });

      await insertLegsAndLines(
        tx,
        txRow.id,
        body,
        sourceAccount,
        req.auth.groupId,
      );
      return txRow;
    });

    return reply.code(201).send(result);
  });

  // ─── Update (income / expense / transfer) ──────────────────────────────

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = transactionBody.parse(req.body);

    const existing = await findOwned(schema.transactions, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.type === "adjustment") {
      return reply
        .code(400)
        .send({ error: "Use /adjustment for adjustment transactions" });
    }

    const sourceAccount = await findOwned(
      schema.accounts,
      body.accountId,
      req.auth.groupId,
    );
    if (!sourceAccount)
      return reply.code(404).send({ error: "Account not found" });

    await db.transaction(async (tx) => {
      await tx
        .update(schema.transactions)
        .set({
          date: body.pending ? null : (body.date ?? null),
          type: body.type,
          description: body.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.transactions.id, id));

      await tx
        .delete(schema.transactionLegs)
        .where(eq(schema.transactionLegs.transactionId, id));
      await tx
        .delete(schema.transactionLines)
        .where(eq(schema.transactionLines.transactionId, id));

      await insertLegsAndLines(tx, id, body, sourceAccount, req.auth.groupId);
    });

    return reply.code(204).send();
  });

  // ─── Update (adjustment only) ──────────────────────────────────────────

  app.patch("/:id/adjustment", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = adjustmentUpdateBody.parse(req.body);

    const existing = await findOwned(schema.transactions, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.type !== "adjustment") {
      return reply.code(400).send({ error: "Not an adjustment" });
    }

    const [leg] = await db
      .select({
        id: schema.transactionLegs.id,
        currency: schema.accounts.currency,
      })
      .from(schema.transactionLegs)
      .innerJoin(
        schema.accounts,
        eq(schema.accounts.id, schema.transactionLegs.accountId),
      )
      .where(eq(schema.transactionLegs.transactionId, id))
      .limit(1);
    if (!leg) throw new Error(`Invariant: adjustment ${id} has no leg`);

    const amountMinor = parseMoney(body.amount, leg.currency);

    await db.transaction(async (tx) => {
      await tx
        .update(schema.transactions)
        .set({
          date: body.date,
          description: body.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.transactions.id, id));
      await tx
        .update(schema.transactionLegs)
        .set({ amount: amountMinor })
        .where(eq(schema.transactionLegs.id, leg.id));
    });

    return reply.code(204).send();
  });

  // ─── Mark processed ────────────────────────────────────────────────────

  app.post("/:id/process", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = processTransactionBody.parse(req.body ?? {});

    const existing = await findOwned(schema.transactions, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.date !== null) {
      return reply.code(409).send({ error: "Already processed" });
    }

    await db
      .update(schema.transactions)
      .set({ date: body.date, updatedAt: new Date() })
      .where(eq(schema.transactions.id, id));
    return reply.code(204).send();
  });

  // ─── Delete ────────────────────────────────────────────────────────────

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwned(schema.transactions, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    // legs + lines cascade.
    await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
    return reply.code(204).send();
  });
};
