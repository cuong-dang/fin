import {
  type Bill,
  type BillDefaultLine,
  type BillDefaultLineBody,
  createBillBody,
  idParam,
  updateBillBody,
} from "@fin/schemas";
import { eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { schema } from "../db";
import { db } from "../db";
import { findOwned, listOwnedActive } from "../lib/authz";
import { resolveCategory } from "../lib/categories-resolve";
import { groupBy } from "../lib/collections";
import { parseMoney } from "../lib/money";
import { upsertTags } from "../lib/tags-upsert";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const billRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // ─── List ────────────────────────────────────────────────────────────────

  app.get("/", async (req): Promise<Bill[]> => {
    const rows = await listOwnedActive(
      schema.bills,
      req.auth.groupId,
      schema.bills.name,
    );
    if (rows.length === 0) return [];
    const linesByBill = await fetchDefaultLines(rows.map((b) => b.id));
    return rows.map((b) => toResponse(b, linesByBill.get(b.id) ?? []));
  });

  // ─── Get one ─────────────────────────────────────────────────────────────

  app.get("/:id", async (req, reply): Promise<Bill | undefined> => {
    const { id } = idParam.parse(req.params);
    const bill = await findOwned(schema.bills, id, req.auth.groupId);
    if (!bill) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    const linesByBill = await fetchDefaultLines([id]);
    return toResponse(bill, linesByBill.get(id) ?? []);
  });

  // ─── Create ─────────────────────────────────────────────────────────────

  app.post("/", async (req, reply) => {
    const body = createBillBody.parse(req.body);
    if (body.defaultAccountId) {
      const errResp = await validateBillDefaultAccount(
        body.defaultAccountId,
        req.auth.groupId,
      );
      if (errResp) return reply.code(400).send({ error: errResp });
    }

    const result = await db.transaction(async (tx) => {
      const [billRow] = await tx
        .insert(schema.bills)
        .values({
          groupId: req.auth.groupId,
          name: body.name,
          type: body.type,
          currency: body.currency,
          frequency: body.frequency,
          defaultAccountId: body.defaultAccountId ?? null,
          description: body.description ?? null,
        })
        .returning({ id: schema.bills.id });

      await insertDefaultLines(
        tx,
        billRow.id,
        body.defaultLines,
        body.currency,
        req.auth.groupId,
      );
      return billRow;
    });
    return reply.code(201).send(result);
  });

  // ─── Update (rewrite) ────────────────────────────────────────────────────

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateBillBody.parse(req.body);
    const existing = await findOwned(schema.bills, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (body.defaultAccountId) {
      const errResp = await validateBillDefaultAccount(
        body.defaultAccountId,
        req.auth.groupId,
      );
      if (errResp) return reply.code(400).send({ error: errResp });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.bills)
        .set({
          name: body.name,
          type: body.type,
          currency: body.currency,
          frequency: body.frequency,
          defaultAccountId: body.defaultAccountId ?? null,
          description: body.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.bills.id, id));

      // Rewrite lines: junction tag rows cascade off the lines.
      await tx
        .delete(schema.billDefaultLines)
        .where(eq(schema.billDefaultLines.billId, id));
      await insertDefaultLines(
        tx,
        id,
        body.defaultLines,
        body.currency,
        req.auth.groupId,
      );
    });
    return reply.code(204).send();
  });

  // ─── Cancel ──────────────────────────────────────────────────────────────

  app.post("/:id/cancel", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwned(schema.bills, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.cancelledAt !== null) {
      return reply.code(409).send({ error: "Already cancelled" });
    }
    await db
      .update(schema.bills)
      .set({ cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.bills.id, id));
    return reply.code(204).send();
  });

  // ─── Resume ──────────────────────────────────────────────────────────────

  // Flip cancelledAt back to null. We don't preserve cancellation history —
  // the user explicitly opted out of that. If a bill is re-cancelled later,
  // only the latest cancelledAt is kept.
  app.post("/:id/resume", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwned(schema.bills, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.cancelledAt === null) {
      return reply.code(409).send({ error: "Not cancelled" });
    }
    await db
      .update(schema.bills)
      .set({ cancelledAt: null, updatedAt: new Date() })
      .where(eq(schema.bills.id, id));
    return reply.code(204).send();
  });

  // ─── Delete ──────────────────────────────────────────────────────────────

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwned(schema.bills, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    // Soft-delete: past transactions still link to this bill via
    // transactions.bill_id (RESTRICT FK) and continue to display its name.
    // Default lines + tag links remain intact for history.
    await db
      .update(schema.bills)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.bills.id, id));
    return reply.code(204).send();
  });
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchDefaultLines(
  billIds: string[],
): Promise<Map<string, BillDefaultLine[]>> {
  if (billIds.length === 0) return new Map();
  const lineRows = await db
    .select({
      id: schema.billDefaultLines.id,
      billId: schema.billDefaultLines.billId,
      amount: schema.billDefaultLines.amount,
      currency: schema.billDefaultLines.currency,
      categoryId: schema.billDefaultLines.categoryId,
      categoryName: schema.categories.name,
      subcategoryId: schema.billDefaultLines.subcategoryId,
      subcategoryName: schema.subcategories.name,
      description: schema.billDefaultLines.description,
    })
    .from(schema.billDefaultLines)
    .innerJoin(
      schema.categories,
      eq(schema.categories.id, schema.billDefaultLines.categoryId),
    )
    .leftJoin(
      schema.subcategories,
      eq(schema.subcategories.id, schema.billDefaultLines.subcategoryId),
    )
    .where(inArray(schema.billDefaultLines.billId, billIds));

  const tagRows = await db
    .select({
      lineId: schema.billDefaultLineTags.lineId,
      tagId: schema.tags.id,
      tagName: schema.tags.name,
    })
    .from(schema.billDefaultLineTags)
    .innerJoin(
      schema.tags,
      eq(schema.tags.id, schema.billDefaultLineTags.tagId),
    )
    .where(
      inArray(
        schema.billDefaultLineTags.lineId,
        lineRows.map((l) => l.id),
      ),
    )
    .orderBy(schema.tags.name);
  const tagsByLine = groupBy(tagRows, (t) => t.lineId);

  return groupBy(
    lineRows,
    (l) => l.billId,
    (l) => ({
      id: l.id,
      amount: l.amount === null ? null : l.amount.toString(),
      currency: l.currency,
      categoryId: l.categoryId,
      categoryName: l.categoryName,
      subcategoryId: l.subcategoryId,
      subcategoryName: l.subcategoryName,
      description: l.description,
      tags: (tagsByLine.get(l.id) ?? []).map((t) => ({
        id: t.tagId,
        name: t.tagName,
      })),
    }),
  );
}

async function insertDefaultLines(
  tx: Tx,
  billId: string,
  lines: BillDefaultLineBody[],
  currency: string,
  workspaceGroupId: string,
): Promise<void> {
  if (lines.length === 0) {
    throw new Error("At least one default line is required");
  }
  // Parse amounts up front so a bad line aborts before any write.
  // Amount may be omitted (utilities, taxes — varies per period).
  const amounts = lines.map((l) =>
    l.amount ? parseMoney(l.amount, currency) : null,
  );
  if (amounts.some((m) => m !== null && m <= 0n)) {
    throw new Error("Each default line amount must be positive when set");
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Bills are always expense-side; pass that to the resolver so an
    // inline-created category gets the right kind.
    const { categoryId, subcategoryId } = await resolveCategory(
      tx,
      line,
      "expense",
      workspaceGroupId,
    );
    const [row] = await tx
      .insert(schema.billDefaultLines)
      .values({
        billId,
        categoryId,
        subcategoryId,
        amount: amounts[i],
        currency,
      })
      .returning({ id: schema.billDefaultLines.id });

    if (line.tagNames && line.tagNames.length > 0) {
      const byName = await upsertTags(tx, line.tagNames, workspaceGroupId);
      const unique = [...new Set(line.tagNames)];
      await tx.insert(schema.billDefaultLineTags).values(
        unique.map((name) => {
          const tagId = byName.get(name);
          if (!tagId) throw new Error(`Invariant: tag "${name}" not resolved`);
          return { lineId: row.id, tagId };
        }),
      );
    }
  }
}

function toResponse(
  bill: typeof schema.bills.$inferSelect,
  defaultLines: BillDefaultLine[],
): Bill {
  return {
    id: bill.id,
    name: bill.name,
    type: bill.type,
    currency: bill.currency,
    frequency: bill.frequency,
    defaultAccountId: bill.defaultAccountId,
    cancelledAt: bill.cancelledAt?.toISOString() ?? null,
    description: bill.description,
    defaultLines,
  };
}

// A bill's default pay-from must be a CASA or CC account. Loan accounts
// represent installment debts (mortgage, car, BNPL) and aren't a charge
// source for recurring bills in any real-world flow — there's no provider
// that bills your mortgage for Netflix.
async function validateBillDefaultAccount(
  accountId: string,
  workspaceGroupId: string,
): Promise<string | null> {
  const account = await findOwned(schema.accounts, accountId, workspaceGroupId);
  if (!account) return "Default account not found in this workspace";
  if (account.type === "loan") {
    return "Default account cannot be a loan account";
  }
  return null;
}
