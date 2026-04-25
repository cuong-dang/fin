import {
  adjustmentUpdateBody,
  type EnrichedTransaction,
  idParam,
  processTransactionBody,
  reorderTransactionsBody,
  transactionBody,
  type TransactionsListResponse,
} from "@fin/schemas";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { schema } from "../db";
import { db } from "../db";
import { findOwned } from "../lib/authz";
import { parseMoney } from "../lib/money";
import {
  anchorsPreserveOrder,
  compactSortKeys,
  mergeReorderIds,
  nextSortKey,
  reassignSortKeys,
} from "../lib/transactions-order";
import { enrichTx, fetchLegsAndLines } from "../lib/transactions-read";
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
          desc(schema.transactions.sortKey),
        )
        .limit(PAGE_LIMIT),
    ]);

    const txIds = [...pendingRows, ...completedRows].map((t) => t.id);
    if (txIds.length === 0) return { pending: [], completed: [] };

    const { legsByTx, linesByTx, tagsByLine } = await fetchLegsAndLines(txIds);

    // Running balance: only when filtered to a single account, and only on
    // completed rows. Walk newest→oldest subtracting each row's leg; the
    // newest row's balanceAfter == the account's present balance.
    const balanceAfterByTx = new Map<string, bigint>();
    if (accountId) {
      const [{ present }] = await db
        .select({
          present: sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}), 0)`,
        })
        .from(schema.transactionLegs)
        .innerJoin(
          schema.transactions,
          eq(schema.transactions.id, schema.transactionLegs.transactionId),
        )
        .where(
          and(
            eq(schema.transactionLegs.accountId, accountId),
            isNotNull(schema.transactions.date),
          ),
        );
      let running = BigInt(present);
      for (const t of completedRows) {
        balanceAfterByTx.set(t.id, running);
        const legs = legsByTx.get(t.id);
        if (!legs) {
          throw new Error(`Invariant: transaction ${t.id} has no legs`);
        }
        const leg = legs.find((l) => l.accountId === accountId);
        if (!leg) {
          throw new Error(
            `Invariant: tx ${t.id} came from accountId filter but has no matching leg`,
          );
        }
        running -= leg.amount;
      }
    }

    const enrich = (t: (typeof pendingRows)[number]) =>
      enrichTx(
        t,
        legsByTx.get(t.id),
        linesByTx.get(t.id),
        tagsByLine,
        balanceAfterByTx.get(t.id),
      );

    return {
      pending: pendingRows.map(enrich),
      completed: completedRows.map(enrich),
    };
  });

  // ─── Get one ─────────────────────────────────────────────────────────────

  app.get(
    "/:id",
    async (req, reply): Promise<EnrichedTransaction | undefined> => {
      const { id } = idParam.parse(req.params);
      const tx = await findOwned(schema.transactions, id, req.auth.groupId);
      if (!tx) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const { legsByTx, linesByTx, tagsByLine } = await fetchLegsAndLines([id]);
      return enrichTx(tx, legsByTx.get(id), linesByTx.get(id), tagsByLine);
    },
  );

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

    const newDate = body.pending ? null : (body.date ?? null);

    const result = await db.transaction(async (tx) => {
      const sortKey = newDate
        ? await nextSortKey(tx, req.auth.groupId, newDate)
        : null;

      const [txRow] = await tx
        .insert(schema.transactions)
        .values({
          groupId: req.auth.groupId,
          userId: req.auth.userId,
          date: newDate,
          sortKey,
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

    const oldDate = existing.date;
    const newDate = body.pending ? null : (body.date ?? null);
    const dateChanged = oldDate !== newDate;

    await db.transaction(async (tx) => {
      // When the bucket changes, move this row to the end of the new bucket
      // (or to NULL if it becomes pending). We set sortKey directly in the
      // UPDATE to avoid a read-then-write race.
      const sortKey = dateChanged
        ? newDate
          ? await nextSortKey(tx, req.auth.groupId, newDate)
          : null
        : undefined;

      await tx
        .update(schema.transactions)
        .set({
          date: newDate,
          type: body.type,
          description: body.description ?? null,
          updatedAt: new Date(),
          ...(sortKey !== undefined ? { sortKey } : {}),
        })
        .where(eq(schema.transactions.id, id));

      // Old bucket now has a gap; compact it back to 1..N.
      if (dateChanged && oldDate) {
        await compactSortKeys(tx, req.auth.groupId, oldDate);
      }

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
    const oldDate = existing.date!; // adjustments always have a date
    const dateChanged = oldDate !== body.date;

    await db.transaction(async (tx) => {
      const sortKey = dateChanged
        ? await nextSortKey(tx, req.auth.groupId, body.date)
        : undefined;

      await tx
        .update(schema.transactions)
        .set({
          date: body.date,
          description: body.description ?? null,
          updatedAt: new Date(),
          ...(sortKey !== undefined ? { sortKey } : {}),
        })
        .where(eq(schema.transactions.id, id));

      if (dateChanged) {
        await compactSortKeys(tx, req.auth.groupId, oldDate);
      }

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

    await db.transaction(async (tx) => {
      const sortKey = await nextSortKey(tx, req.auth.groupId, body.date);
      await tx
        .update(schema.transactions)
        .set({ date: body.date, sortKey, updatedAt: new Date() })
        .where(eq(schema.transactions.id, id));
    });
    return reply.code(204).send();
  });

  // ─── Reorder (same-day or cross-day, single mover) ─────────────────────

  // Contract: exactly one transaction moves per request — `body.movingId`.
  // It ends up on body.date at the position dictated by its slot in
  // `body.ids`. Other ids in body.ids must be on body.date and appear in
  // their existing relative order (the client enforces this).
  app.post("/reorder", async (req, reply) => {
    const body = reorderTransactionsBody.parse(req.body);

    if (new Set(body.ids).size !== body.ids.length) {
      return reply.code(400).send({ error: "Duplicate ids" });
    }
    if (!body.ids.includes(body.movingId)) {
      return reply.code(400).send({ error: "movingId must be present in ids" });
    }

    const [moving] = await db
      .select({
        id: schema.transactions.id,
        date: schema.transactions.date,
      })
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.groupId, req.auth.groupId),
          eq(schema.transactions.id, body.movingId),
        ),
      )
      .limit(1);
    if (!moving) return reply.code(404).send({ error: "Not found" });
    if (moving.date === null) {
      return reply
        .code(400)
        .send({ error: "Cannot reorder pending transactions" });
    }
    const sourceDate = moving.date;

    // Snapshot body.date's current order for both validation and the merge.
    const existingRows = await db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.groupId, req.auth.groupId),
          eq(schema.transactions.date, body.date),
        ),
      )
      .orderBy(desc(schema.transactions.sortKey));
    const existingIds = existingRows.map((r) => r.id);

    // Precondition: the non-moving ids in body.ids must already be on
    // body.date and appear in their existing (sort_key DESC) order.
    // Violations indicate the client tried to move more than one row —
    // contract is "single transaction per reorder request."
    if (!anchorsPreserveOrder(existingIds, body.ids, body.movingId)) {
      return reply.code(400).send({
        error:
          "ids must preserve existing order; only one transaction may move per request",
      });
    }

    const merged = mergeReorderIds(existingIds, body.ids, body.movingId);

    await db.transaction(async (tx) => {
      // Cross-date: park movingId on body.date with a temp max+1 sort_key
      // so reassignSortKeys finds it in the bucket, then compact its old
      // date to close the gap.
      if (sourceDate !== body.date) {
        const next = await nextSortKey(tx, req.auth.groupId, body.date);
        await tx
          .update(schema.transactions)
          .set({ date: body.date, sortKey: next, updatedAt: new Date() })
          .where(eq(schema.transactions.id, body.movingId));
        await compactSortKeys(tx, req.auth.groupId, sourceDate);
      }

      await reassignSortKeys(tx, req.auth.groupId, body.date, merged);
    });
    return reply.code(204).send();
  });

  // ─── Delete ────────────────────────────────────────────────────────────

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwned(schema.transactions, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });

    await db.transaction(async (tx) => {
      // legs + lines cascade.
      await tx
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, id));
      if (existing.date) {
        await compactSortKeys(tx, req.auth.groupId, existing.date);
      }
    });
    return reply.code(204).send();
  });
};
