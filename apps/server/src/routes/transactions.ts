import {
  adjustmentUpdateBody,
  type EnrichedTransaction,
  idParam,
  processTransactionBody,
  reorderTransactionsBody,
  transactionBody,
  type TransactionsListResponse,
} from "@fin/schemas";
import { dateString } from "@fin/schemas";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { schema } from "../db/index.js";
import { db } from "../db/index.js";
import { findOwned, findOwnedParent } from "../lib/authz.js";
import { parseMoney } from "../lib/money.js";
import {
  anchorsPreserveOrder,
  compactSortKeys,
  mergeReorderIds,
  nextSortKey,
  reassignSortKeys,
} from "../lib/transactions-order.js";
import { enrichTx, fetchLegsAndLines } from "../lib/transactions-read.js";
import { insertLegsAndLines } from "../lib/transactions-write.js";

// Completed rows are paged by *day*: each page returns up to PAGE_DAYS
// whole days (never a partial day) so day-scoped reorder and running
// balance stay correct across the page boundary.
const PAGE_DAYS = 30;

const listQuery = z.object({
  accountId: z.uuid().optional(),
  // Oldest date already seen; this page returns days strictly older than it.
  // Absent on the first page.
  cursor: dateString.optional(),
});

export const transactionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // ─── List ────────────────────────────────────────────────────────────────

  app.get("/", async (req): Promise<TransactionsListResponse> => {
    const { accountId, cursor } = listQuery.parse(req.query);
    const firstPage = cursor === undefined;

    const filteredTxIds = accountId
      ? db
          .select({ id: schema.transactionLegs.transactionId })
          .from(schema.transactionLegs)
          .where(eq(schema.transactionLegs.accountId, accountId))
      : undefined;

    const baseWhere = and(
      eq(schema.transactions.workspaceId, req.auth.workspaceId),
      filteredTxIds
        ? inArray(schema.transactions.id, filteredTxIds)
        : undefined,
    );

    // Only days strictly older than the cursor belong to this page.
    const olderThanCursor = cursor
      ? lt(schema.transactions.date, cursor)
      : undefined;

    // Pick this page's days first (fetch one extra to detect a next page),
    // then load every row on those days. This guarantees whole-day pages.
    const dayRows = await db
      .selectDistinct({ date: schema.transactions.date })
      .from(schema.transactions)
      .where(
        and(baseWhere, isNotNull(schema.transactions.date), olderThanCursor),
      )
      .orderBy(desc(schema.transactions.date))
      .limit(PAGE_DAYS + 1);

    const hasMore = dayRows.length > PAGE_DAYS;
    const pageDays = dayRows.slice(0, PAGE_DAYS);
    // Oldest day in this page; also the exclusive bound for the next page.
    const oldestDay = pageDays.at(-1)?.date ?? null;
    const nextCursor = hasMore ? oldestDay : null;

    const [pendingRows, completedRows] = await Promise.all([
      // Pending rows are dateless and belong to no day — return them once,
      // on the first page only.
      firstPage
        ? db
            .select()
            .from(schema.transactions)
            .where(and(baseWhere, isNull(schema.transactions.date)))
            .orderBy(asc(schema.transactions.createdAt))
        : Promise.resolve([]),
      oldestDay
        ? db
            .select()
            .from(schema.transactions)
            .where(
              and(
                baseWhere,
                gte(schema.transactions.date, oldestDay),
                olderThanCursor,
              ),
            )
            .orderBy(
              desc(schema.transactions.date),
              desc(schema.transactions.sortKey),
            )
        : Promise.resolve([]),
    ]);

    const txIds = [...pendingRows, ...completedRows].map((t) => t.id);
    if (txIds.length === 0) {
      return { pending: [], completed: [], nextCursor };
    }

    const { legsByTx, linesByTx, tagsByLine, billByTx, refundedByTx } =
      await fetchLegsAndLines(txIds);

    // Running balance: only when filtered to a single account, and only on
    // completed rows. Walk newest→oldest subtracting each row's leg; the
    // newest row's balanceAfter == the account's present balance.
    const balanceAfterByTx = new Map<string, bigint>();
    if (accountId) {
      // Start from the account balance as of this page's newest row: the
      // sum of every completed leg on this page and older (date < cursor).
      // On the first page (no cursor) that's every leg, i.e. the present
      // balance. Whole-day pages make `date < cursor` an exact split, so
      // this equals the newest row's balanceAfter.
      const [{ startBalance }] = await db
        .select({
          startBalance: sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}), 0)`,
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
            olderThanCursor,
          ),
        );
      let running = BigInt(startBalance);
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
        billByTx.get(t.id),
        refundedByTx.get(t.id),
        balanceAfterByTx.get(t.id),
      );

    return {
      pending: pendingRows.map(enrich),
      completed: completedRows.map(enrich),
      nextCursor,
    };
  });

  // ─── Get one ─────────────────────────────────────────────────────────────

  app.get(
    "/:id",
    async (req, reply): Promise<EnrichedTransaction | undefined> => {
      const { id } = idParam.parse(req.params);
      const tx = await findOwned(schema.transactions, id, req.auth.workspaceId);
      if (!tx) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const { legsByTx, linesByTx, tagsByLine, billByTx, refundedByTx } =
        await fetchLegsAndLines([id]);
      return enrichTx(
        tx,
        legsByTx.get(id),
        linesByTx.get(id),
        tagsByLine,
        billByTx.get(id),
        refundedByTx.get(id),
      );
    },
  );

  // ─── Create ─────────────────────────────────────────────────────────────

  app.post("/", async (req, reply) => {
    const body = transactionBody.parse(req.body);

    const sourceAccount = await findOwnedParent(
      schema.accounts,
      schema.accountGroups,
      schema.accounts.accountGroupId,
      schema.accountGroups.id,
      body.accountId,
      req.auth.workspaceId,
    );
    if (!sourceAccount)
      return reply.code(404).send({ error: "Account not found" });

    // An expense may carry an optional bill link (it represents a bill
    // charge in that case). Validate ownership before writing.
    if (body.type === "expense" && body.billId) {
      const bill = await findOwned(
        schema.bills,
        body.billId,
        req.auth.workspaceId,
      );
      if (!bill) return reply.code(404).send({ error: "Bill not found" });
    }

    // A refund must point at an existing expense in the same workspace.
    // Refunds of refunds, transfers, etc. don't make sense — surface 422.
    if (body.type === "refund") {
      const original = await findOwned(
        schema.transactions,
        body.refundedTransactionId,
        req.auth.workspaceId,
      );
      if (!original) {
        return reply
          .code(404)
          .send({ error: "Original transaction not found" });
      }
      if (original.type !== "expense") {
        return reply
          .code(422)
          .send({ error: "Refunds can only target expense transactions" });
      }
    }

    const newDate = body.pending ? null : (body.date ?? null);
    const billId = body.type === "expense" ? (body.billId ?? null) : null;
    const refundedTransactionId =
      body.type === "refund" ? body.refundedTransactionId : null;

    const result = await db.transaction(async (tx) => {
      const sortKey = newDate
        ? await nextSortKey(tx, req.auth.workspaceId, newDate)
        : null;

      const [txRow] = await tx
        .insert(schema.transactions)
        .values({
          workspaceId: req.auth.workspaceId,
          userId: req.auth.userId,
          date: newDate,
          type: body.type,
          sortKey,
          description: body.description ?? null,
          billId,
          refundedTransactionId,
        })
        .returning({ id: schema.transactions.id });

      await insertLegsAndLines(
        tx,
        txRow.id,
        body,
        sourceAccount,
        req.auth.workspaceId,
      );
      return txRow;
    });

    return reply.code(201).send(result);
  });

  // ─── Update (income / expense / transfer) ──────────────────────────────

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = transactionBody.parse(req.body);

    const existing = await findOwned(
      schema.transactions,
      id,
      req.auth.workspaceId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.type === "adjustment") {
      return reply
        .code(400)
        .send({ error: "Use /adjustment for adjustment transactions" });
    }
    // Refunds are bound to their original tx; flipping type would
    // orphan the FK and corrupt analytics. Require delete + recreate
    // if the user really wants to change type.
    if (existing.type === "refund" && body.type !== "refund") {
      return reply.code(422).send({
        error:
          "Refund transactions can't change type. Delete and create a new one.",
      });
    }
    if (existing.type !== "refund" && body.type === "refund") {
      return reply.code(422).send({
        error: "Only newly created transactions can be refunds.",
      });
    }
    // An expense with refunds attached can't change type — flipping
    // it to income/transfer would leave dangling refunds pointing at
    // a non-expense parent and silently corrupt analytics. We let the
    // user edit description/date/lines freely (the math may go weird
    // if they reduce lines below refund totals, but that's their
    // data choice); type changes are the hard line.
    if (existing.type === "expense" && body.type !== "expense") {
      const [{ refundCount }] = await db
        .select({
          refundCount: sql<number>`COUNT(*)::int`,
        })
        .from(schema.transactions)
        .where(eq(schema.transactions.refundedTransactionId, id));
      if (refundCount > 0) {
        return reply.code(422).send({
          error:
            "This expense has refunds linked to it. Delete the refunds before changing its type.",
        });
      }
    }

    const sourceAccount = await findOwnedParent(
      schema.accounts,
      schema.accountGroups,
      schema.accounts.accountGroupId,
      schema.accountGroups.id,
      body.accountId,
      req.auth.workspaceId,
    );
    if (!sourceAccount)
      return reply.code(404).send({ error: "Account not found" });

    if (body.type === "expense" && body.billId) {
      const bill = await findOwned(
        schema.bills,
        body.billId,
        req.auth.workspaceId,
      );
      if (!bill) return reply.code(404).send({ error: "Bill not found" });
    }

    // Refund-target is immutable on PATCH; we still validate that the
    // existing link is intact (cheap, catches DB drift).
    if (body.type === "refund") {
      if (body.refundedTransactionId !== existing.refundedTransactionId) {
        return reply
          .code(422)
          .send({ error: "refundedTransactionId is immutable" });
      }
    }

    const oldDate = existing.date;
    const newDate = body.pending ? null : (body.date ?? null);
    const dateChanged = oldDate !== newDate;
    const billId = body.type === "expense" ? (body.billId ?? null) : null;

    await db.transaction(async (tx) => {
      // When the bucket changes, move this row to the end of the new bucket
      // (or to NULL if it becomes pending). We set sortKey directly in the
      // UPDATE to avoid a read-then-write race.
      const sortKey = dateChanged
        ? newDate
          ? await nextSortKey(tx, req.auth.workspaceId, newDate)
          : null
        : undefined;

      await tx
        .update(schema.transactions)
        .set({
          date: newDate,
          type: body.type,
          description: body.description ?? null,
          billId,
          updatedAt: new Date(),
          ...(sortKey !== undefined ? { sortKey } : {}),
        })
        .where(eq(schema.transactions.id, id));

      // Old bucket now has a gap; compact it back to 1..N.
      if (dateChanged && oldDate) {
        await compactSortKeys(tx, req.auth.workspaceId, oldDate);
      }

      await tx
        .delete(schema.transactionLegs)
        .where(eq(schema.transactionLegs.transactionId, id));
      await tx
        .delete(schema.transactionLines)
        .where(eq(schema.transactionLines.transactionId, id));

      await insertLegsAndLines(
        tx,
        id,
        body,
        sourceAccount,
        req.auth.workspaceId,
      );
    });

    return reply.code(204).send();
  });

  // ─── Update (adjustment only) ──────────────────────────────────────────

  app.patch("/:id/adjustment", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = adjustmentUpdateBody.parse(req.body);

    const existing = await findOwned(
      schema.transactions,
      id,
      req.auth.workspaceId,
    );
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
        ? await nextSortKey(tx, req.auth.workspaceId, body.date)
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
        await compactSortKeys(tx, req.auth.workspaceId, oldDate);
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

    const existing = await findOwned(
      schema.transactions,
      id,
      req.auth.workspaceId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.date !== null) {
      return reply.code(409).send({ error: "Already processed" });
    }

    await db.transaction(async (tx) => {
      const sortKey = await nextSortKey(tx, req.auth.workspaceId, body.date);
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
          eq(schema.transactions.workspaceId, req.auth.workspaceId),
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
          eq(schema.transactions.workspaceId, req.auth.workspaceId),
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
        const next = await nextSortKey(tx, req.auth.workspaceId, body.date);
        await tx
          .update(schema.transactions)
          .set({ date: body.date, sortKey: next, updatedAt: new Date() })
          .where(eq(schema.transactions.id, body.movingId));
        await compactSortKeys(tx, req.auth.workspaceId, sourceDate);
      }

      await reassignSortKeys(tx, req.auth.workspaceId, body.date, merged);
    });
    return reply.code(204).send();
  });

  // ─── Delete ────────────────────────────────────────────────────────────

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwned(
      schema.transactions,
      id,
      req.auth.workspaceId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });

    // Hard-delete: legs + lines + tag-junction rows cascade. Account
    // balances and recurring-plan principal totals re-derive from the
    // remaining legs/lines automatically.
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, id));
      if (existing.date) {
        await compactSortKeys(tx, req.auth.workspaceId, existing.date);
      }
    });
    return reply.code(204).send();
  });
};
