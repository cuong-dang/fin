import {
  type CreateAccountBody,
  createAccountBody,
  idParam,
  type RecurringPlanDefaultLine,
  type UpdateAccountBody,
  updateAccountBody,
} from "@fin/schemas";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { schema } from "../db";
import { db } from "../db";
import { findOwned, ownedActive } from "../lib/authz";
import { groupBy } from "../lib/collections";
import { parseMoney } from "../lib/money";
import {
  insertRecurringPlan,
  updateRecurringPlan,
} from "../lib/recurring-plans-write";
import { nextSortKey } from "../lib/transactions-order";

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // Pending = date IS NULL. Hard-deleted transactions take their legs
  // with them, so we don't need a deleted_at filter here.
  const presentBalanceSql = sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}) FILTER (WHERE ${schema.transactions.date} IS NOT NULL), 0)`;
  const availableBalanceSql = sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}), 0)`;

  // Plan fields embedded on the loan account row (default lines fetched
  // separately below and merged in `rowToResponse`). Bigints cast to text
  // for JSON safety. LEFT JOIN so non-loan accounts get nulls.
  const planSummary = {
    planId: schema.recurringPlans.id,
    planAmountPerPeriod: sql<
      string | null
    >`${schema.recurringPlans.amountPerPeriod}::text`.as(
      "plan_amount_per_period",
    ),
    planFrequency: schema.recurringPlans.frequency,
    planDefaultAccountId: schema.recurringPlans.defaultAccountId,
    planDescription: schema.recurringPlans.description,
  };

  type AccountRow = {
    id: string;
    accountGroupId: string;
    name: string;
    currency: string;
    type: "checking_savings" | "credit_card" | "loan";
    creditLimit: string | null;
    defaultPayFromAccountId: string | null;
    presentBalance: string;
    availableBalance: string;
    archivedAt: Date | null;
    excludeFromNetWorth: boolean;
    planId: string | null;
    planAmountPerPeriod: string | null;
    planFrequency:
      | "weekly"
      | "biweekly"
      | "monthly"
      | "quarterly"
      | "yearly"
      | null;
    planDefaultAccountId: string | null;
    planDescription: string | null;
  };

  function rowToResponse(
    row: AccountRow,
    linesByPlan: Map<string, RecurringPlanDefaultLine[]>,
  ) {
    const {
      planId,
      planAmountPerPeriod,
      planFrequency,
      planDefaultAccountId,
      planDescription,
      archivedAt,
      ...rest
    } = row;
    return {
      ...rest,
      archivedAt: archivedAt?.toISOString() ?? null,
      recurringPlan:
        planId && planAmountPerPeriod && planFrequency
          ? {
              id: planId,
              amountPerPeriod: planAmountPerPeriod,
              frequency: planFrequency,
              defaultAccountId: planDefaultAccountId,
              description: planDescription,
              defaultLines: linesByPlan.get(planId) ?? [],
            }
          : null,
    };
  }

  /** List active accounts with present + available balance. */
  app.get("/", async (req) => {
    const rows = await db
      .select({
        id: schema.accounts.id,
        accountGroupId: schema.accounts.accountGroupId,
        name: schema.accounts.name,
        currency: schema.accounts.currency,
        type: schema.accounts.type,
        creditLimit: sql<
          string | null
        >`${schema.accounts.creditLimit}::text`.as("credit_limit"),
        defaultPayFromAccountId: schema.accounts.defaultPayFromAccountId,
        presentBalance: presentBalanceSql.as("present_balance"),
        availableBalance: availableBalanceSql.as("available_balance"),
        archivedAt: schema.accounts.archivedAt,
        excludeFromNetWorth: schema.accounts.excludeFromNetWorth,
        ...planSummary,
      })
      .from(schema.accounts)
      .leftJoin(
        schema.transactionLegs,
        eq(schema.transactionLegs.accountId, schema.accounts.id),
      )
      .leftJoin(
        schema.transactions,
        eq(schema.transactions.id, schema.transactionLegs.transactionId),
      )
      .leftJoin(
        schema.recurringPlans,
        eq(schema.recurringPlans.id, schema.accounts.recurringPlanId),
      )
      .where(ownedActive(schema.accounts, req.auth.groupId))
      .groupBy(schema.accounts.id, schema.recurringPlans.id)
      .orderBy(schema.accounts.name);
    const planIds = rows
      .map((r) => r.planId)
      .filter((id): id is string => id !== null);
    const linesByPlan = await fetchPlanDefaultLines(planIds);
    return rows.map((r) => rowToResponse(r, linesByPlan));
  });

  /** Fetch a single account (with balances). Used by the edit page. */
  app.get("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const account = await findOwned(schema.accounts, id, req.auth.groupId);
    if (!account) return reply.code(404).send({ error: "Not found" });
    const [row] = await db
      .select({
        id: schema.accounts.id,
        accountGroupId: schema.accounts.accountGroupId,
        name: schema.accounts.name,
        currency: schema.accounts.currency,
        type: schema.accounts.type,
        creditLimit: sql<
          string | null
        >`${schema.accounts.creditLimit}::text`.as("credit_limit"),
        defaultPayFromAccountId: schema.accounts.defaultPayFromAccountId,
        presentBalance: presentBalanceSql.as("present_balance"),
        availableBalance: availableBalanceSql.as("available_balance"),
        archivedAt: schema.accounts.archivedAt,
        excludeFromNetWorth: schema.accounts.excludeFromNetWorth,
        ...planSummary,
      })
      .from(schema.accounts)
      .leftJoin(
        schema.transactionLegs,
        eq(schema.transactionLegs.accountId, schema.accounts.id),
      )
      .leftJoin(
        schema.transactions,
        eq(schema.transactions.id, schema.transactionLegs.transactionId),
      )
      .leftJoin(
        schema.recurringPlans,
        eq(schema.recurringPlans.id, schema.accounts.recurringPlanId),
      )
      .where(eq(schema.accounts.id, id))
      .groupBy(schema.accounts.id, schema.recurringPlans.id);
    const linesByPlan = row.planId
      ? await fetchPlanDefaultLines([row.planId])
      : new Map<string, RecurringPlanDefaultLine[]>();
    return rowToResponse(row, linesByPlan);
  });

  app.post("/", async (req, reply) => {
    const body = createAccountBody.parse(req.body);
    if (Boolean(body.accountGroupId) === Boolean(body.newGroupName)) {
      return reply.code(400).send({
        error: "Provide exactly one of an existing group or a new group name",
      });
    }

    // Parse starting balance up front so a bad value aborts before any write.
    const startingMinor = body.startingBalance
      ? parseMoney(body.startingBalance, body.currency)
      : 0n;
    if (startingMinor !== 0n && !body.adjustmentDate) {
      return reply.code(400).send({
        error:
          "adjustmentDate is required when a non-zero startingBalance is set",
      });
    }

    const ccFields = await resolveCcFields(
      body,
      body.currency,
      req.auth.groupId,
      reply,
    );
    if (ccFields === null) return;

    // Loan: pre-validate plan's pay-from (must be checking_savings) before
    // opening the write tx. The plan row itself is created inside the tx.
    if (body.type === "loan" && body.recurringPlan.defaultAccountId) {
      const payFrom = await findOwned(
        schema.accounts,
        body.recurringPlan.defaultAccountId,
        req.auth.groupId,
      );
      if (!payFrom) {
        return reply
          .code(400)
          .send({ error: "Default pay-from account not found" });
      }
      if (payFrom.type === "loan") {
        return reply.code(400).send({
          error: "Default pay-from cannot be a loan account",
        });
      }
    }

    const result = await db.transaction(async (tx) => {
      let accountGroupId = body.accountGroupId;
      if (body.newGroupName) {
        const [row] = await tx
          .insert(schema.accountGroups)
          .values({ groupId: req.auth.groupId, name: body.newGroupName })
          .returning({ id: schema.accountGroups.id });
        accountGroupId = row.id;
      }

      // For loan accounts, create the plan first so the account row can
      // reference it via accounts.recurring_plan_id.
      const recurringPlanId =
        body.type === "loan"
          ? await insertRecurringPlan(
              tx,
              body.recurringPlan,
              body.currency,
              req.auth.groupId,
            )
          : null;

      const [accountRow] = await tx
        .insert(schema.accounts)
        .values({
          groupId: req.auth.groupId,
          accountGroupId: accountGroupId!,
          name: body.name,
          currency: body.currency,
          type: body.type,
          creditLimit: ccFields.creditLimit,
          defaultPayFromAccountId: ccFields.defaultPayFromAccountId,
          recurringPlanId,
          excludeFromNetWorth: body.excludeFromNetWorth ?? false,
        })
        .returning({
          id: schema.accounts.id,
          accountGroupId: schema.accounts.accountGroupId,
          name: schema.accounts.name,
          currency: schema.accounts.currency,
          type: schema.accounts.type,
        });

      if (startingMinor !== 0n) {
        const sortKey = await nextSortKey(
          tx,
          req.auth.groupId,
          body.adjustmentDate!,
        );
        const [txRow] = await tx
          .insert(schema.transactions)
          .values({
            groupId: req.auth.groupId,
            userId: req.auth.userId,
            date: body.adjustmentDate!,
            sortKey,
            type: "adjustment",
            description: "Starting balance",
          })
          .returning({ id: schema.transactions.id });
        await tx.insert(schema.transactionLegs).values({
          transactionId: txRow.id,
          accountId: accountRow.id,
          amount: startingMinor,
        });
      }

      return accountRow;
    });

    return reply.code(201).send(result);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateAccountBody.parse(req.body);
    if (Boolean(body.accountGroupId) === Boolean(body.newGroupName)) {
      return reply.code(400).send({
        error: "Provide exactly one of an existing group or a new group name",
      });
    }

    const account = await findOwned(schema.accounts, id, req.auth.groupId);
    if (!account) return reply.code(404).send({ error: "Not found" });
    if (account.type !== body.type) {
      return reply
        .code(400)
        .send({ error: "Account type cannot be changed after creation" });
    }

    // Validate existing group pick up front; new group is created in the tx.
    if (!body.newGroupName && body.accountGroupId) {
      const targetGroup = await findOwned(
        schema.accountGroups,
        body.accountGroupId,
        req.auth.groupId,
      );
      if (!targetGroup)
        return reply.code(400).send({ error: "Destination group not found" });
    }

    const ccFields = await resolveCcFields(
      body,
      account.currency,
      req.auth.groupId,
      reply,
    );
    if (ccFields === null) return;

    // Loan: pre-validate plan's pay-from up front (mirrors POST). The plan
    // row update happens inside the tx below.
    if (body.type === "loan" && body.recurringPlan.defaultAccountId) {
      const payFrom = await findOwned(
        schema.accounts,
        body.recurringPlan.defaultAccountId,
        req.auth.groupId,
      );
      if (!payFrom) {
        return reply
          .code(400)
          .send({ error: "Default pay-from account not found" });
      }
      if (payFrom.type === "loan") {
        return reply.code(400).send({
          error: "Default pay-from cannot be a loan account",
        });
      }
    }

    // Compute balance delta up front (bail on parse error before DB writes).
    let delta = 0n;
    if (body.newBalance !== undefined) {
      const newMinor = parseMoney(body.newBalance, account.currency);
      // Present balance only — pending legs (transactions.date IS NULL)
      // haven't posted, so they must not count toward the delta.
      const [{ current }] = await db
        .select({
          current: sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}), 0)`,
        })
        .from(schema.transactionLegs)
        .innerJoin(
          schema.transactions,
          eq(schema.transactions.id, schema.transactionLegs.transactionId),
        )
        .where(
          and(
            eq(schema.transactionLegs.accountId, id),
            isNotNull(schema.transactions.date),
          ),
        );
      delta = newMinor - BigInt(current);
    }
    if (delta !== 0n && !body.adjustmentDate) {
      return reply.code(400).send({
        error: "adjustmentDate is required when balance is changing",
      });
    }

    await db.transaction(async (tx) => {
      let accountGroupId = body.accountGroupId;
      if (body.newGroupName) {
        const [row] = await tx
          .insert(schema.accountGroups)
          .values({ groupId: req.auth.groupId, name: body.newGroupName })
          .returning({ id: schema.accountGroups.id });
        accountGroupId = row.id;
      }

      await tx
        .update(schema.accounts)
        .set({
          name: body.name,
          accountGroupId: accountGroupId!,
          creditLimit: ccFields.creditLimit,
          defaultPayFromAccountId: ccFields.defaultPayFromAccountId,
          excludeFromNetWorth: body.excludeFromNetWorth ?? false,
          updatedAt: new Date(),
        })
        .where(eq(schema.accounts.id, id));

      // Loan: rewrite the paired plan + its default lines. The link
      // (accounts.recurring_plan_id) doesn't change — we update the
      // existing plan in place.
      if (body.type === "loan") {
        if (!account.recurringPlanId) {
          throw new Error(
            `Invariant: loan account ${id} missing recurring_plan_id`,
          );
        }
        await updateRecurringPlan(
          tx,
          account.recurringPlanId,
          body.recurringPlan,
          account.currency,
          req.auth.groupId,
        );
      }

      if (delta !== 0n) {
        const sortKey = await nextSortKey(
          tx,
          req.auth.groupId,
          body.adjustmentDate!,
        );
        const [txRow] = await tx
          .insert(schema.transactions)
          .values({
            groupId: req.auth.groupId,
            userId: req.auth.userId,
            date: body.adjustmentDate!,
            sortKey,
            type: "adjustment",
            description: null,
          })
          .returning({ id: schema.transactions.id });
        await tx.insert(schema.transactionLegs).values({
          transactionId: txRow.id,
          accountId: id,
          amount: delta,
        });
      }
    });

    return reply.code(204).send();
  });

  // Archive: hide an account from sidebar/pickers without deleting it.
  // Used today for paid-off loans the user wants out of the way but
  // preserved for history. Reversible via /unarchive.
  app.post("/:id/archive", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const account = await findOwned(schema.accounts, id, req.auth.groupId);
    if (!account) return reply.code(404).send({ error: "Not found" });
    if (account.archivedAt !== null) {
      return reply.code(409).send({ error: "Already archived" });
    }
    await db
      .update(schema.accounts)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.accounts.id, id));
    return reply.code(204).send();
  });

  app.post("/:id/unarchive", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const account = await findOwned(schema.accounts, id, req.auth.groupId);
    if (!account) return reply.code(404).send({ error: "Not found" });
    if (account.archivedAt === null) {
      return reply.code(409).send({ error: "Not archived" });
    }
    await db
      .update(schema.accounts)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(schema.accounts.id, id));
    return reply.code(204).send();
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);

    const account = await findOwned(schema.accounts, id, req.auth.groupId);
    if (!account) return reply.code(404).send({ error: "Not found" });

    // Soft-delete: existing transaction legs stay attached and historical
    // tx displays still resolve the account name. The account simply
    // disappears from balances/sidebars/pickers. (No more "has tx" gate —
    // soft-delete has no integrity issue with referencing legs.)
    await db
      .update(schema.accounts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.accounts.id, id));
    return reply.code(204).send();
  });
};

type CcFields = {
  creditLimit: bigint | null;
  defaultPayFromAccountId: string | null;
};

// Validates the CC pay-from account: exists, owned, and is a
// checking_savings account. Self-reference is implicitly rejected by the
// type check (a CC pointing at itself fails the checking_savings test).
async function validatePayFrom(
  payFromId: string,
  workspaceGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = await findOwned(schema.accounts, payFromId, workspaceGroupId);
  if (!target) return { ok: false, error: "Pay-from account not found" };
  if (target.type !== "checking_savings") {
    return {
      ok: false,
      error: "Pay-from account must be a checking/savings account",
    };
  }
  return { ok: true };
}

// Resolves CC-specific fields (limit, pay-from) for both create and update.
// Currency is passed in because update bodies don't carry it (currency is
// fixed at creation), but the body shape is otherwise identical for the
// CC variant of either schema.
async function resolveCcFields(
  body: CreateAccountBody | UpdateAccountBody,
  currency: string,
  workspaceGroupId: string,
  reply: FastifyReply,
): Promise<CcFields | null> {
  if (body.type !== "credit_card") {
    return { creditLimit: null, defaultPayFromAccountId: null };
  }
  const limitMinor = parseMoney(body.creditLimit, currency);
  if (limitMinor <= 0n) {
    reply.code(400).send({ error: "Credit limit must be positive" });
    return null;
  }
  if (body.defaultPayFromAccountId) {
    const result = await validatePayFrom(
      body.defaultPayFromAccountId,
      workspaceGroupId,
    );
    if (!result.ok) {
      reply.code(400).send({ error: result.error });
      return null;
    }
  }
  return {
    creditLimit: limitMinor,
    defaultPayFromAccountId: body.defaultPayFromAccountId ?? null,
  };
}

// Hydrates default lines (with categories, subcategories, and tags) for
// the given plan ids. Mirrors the bill default-line fetch:
// inner-join the category, left-join the subcategory, then a second pass
// for the M2M tag rows. Plan default-line amounts are nullable (loan
// principal/interest splits vary per period), so the response carries
// `amount: string | null`.
async function fetchPlanDefaultLines(
  planIds: string[],
): Promise<Map<string, RecurringPlanDefaultLine[]>> {
  if (planIds.length === 0) return new Map();
  const lineRows = await db
    .select({
      id: schema.recurringPlanDefaultLines.id,
      planId: schema.recurringPlanDefaultLines.recurringPlanId,
      amount: schema.recurringPlanDefaultLines.amount,
      currency: schema.recurringPlanDefaultLines.currency,
      categoryId: schema.recurringPlanDefaultLines.categoryId,
      categoryName: schema.categories.name,
      subcategoryId: schema.recurringPlanDefaultLines.subcategoryId,
      subcategoryName: schema.subcategories.name,
      description: schema.recurringPlanDefaultLines.description,
    })
    .from(schema.recurringPlanDefaultLines)
    .innerJoin(
      schema.categories,
      eq(schema.categories.id, schema.recurringPlanDefaultLines.categoryId),
    )
    .leftJoin(
      schema.subcategories,
      eq(
        schema.subcategories.id,
        schema.recurringPlanDefaultLines.subcategoryId,
      ),
    )
    .where(inArray(schema.recurringPlanDefaultLines.recurringPlanId, planIds));

  const tagRows = lineRows.length
    ? await db
        .select({
          lineId: schema.recurringPlanDefaultLineTags.lineId,
          tagId: schema.tags.id,
          tagName: schema.tags.name,
        })
        .from(schema.recurringPlanDefaultLineTags)
        .innerJoin(
          schema.tags,
          eq(schema.tags.id, schema.recurringPlanDefaultLineTags.tagId),
        )
        .where(
          inArray(
            schema.recurringPlanDefaultLineTags.lineId,
            lineRows.map((l) => l.id),
          ),
        )
        .orderBy(schema.tags.name)
    : [];
  const tagsByLine = groupBy(tagRows, (t) => t.lineId);

  return groupBy(
    lineRows,
    (l) => l.planId,
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
