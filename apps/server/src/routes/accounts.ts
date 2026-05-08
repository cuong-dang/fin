import type {
  Account,
  AccountType,
  LoanDefaultLine,
  RecurringFrequency,
} from "@fin/schemas";
import {
  type CreateAccountBody,
  createAccountBody,
  idParam,
  type UpdateAccountBody,
  updateAccountBody,
} from "@fin/schemas";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { schema } from "../db/index.js";
import { db } from "../db/index.js";
import { findOwned, findOwnedParent, ownedParentActive } from "../lib/authz.js";
import { groupBy } from "../lib/collections.js";
import { insertLoan, updateRecurringPlan } from "../lib/loans-write.js";
import { parseMoney } from "../lib/money.js";
import { nextSortKey } from "../lib/transactions-order.js";

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  /** List active accounts with present + available balance. */
  app.get("/", async (req): Promise<Account[]> => {
    return fetchAccounts(req.auth.workspaceId);
  });

  /** Fetch a single account (with balances). Used by the edit page. */
  app.get("/:id", async (req, reply): Promise<Account> => {
    const { id } = idParam.parse(req.params);
    const accounts = await fetchAccounts(req.auth.workspaceId, id);
    if (accounts.length === 0)
      return reply.code(404).send({ error: "Not found" });
    return accounts[0];
  });

  app.post("/", async (req, reply) => {
    const body = createAccountBody.parse(req.body);
    if (Boolean(body.accountGroupId) === Boolean(body.newAccountGroupName)) {
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
      req.auth.workspaceId,
      reply,
    );
    if (ccFields === null) return;

    // Loan: pre-validate plan's pay-from (must be checking_savings or credit_card)
    // before opening the write tx. The plan row itself is created inside the tx.
    if (body.type === "loan" && body.defaultPayFromAccountId) {
      const { ok, error } = await validatePayFrom(
        body.defaultPayFromAccountId,
        req.auth.workspaceId,
        ["checking_savings", "credit_card"],
      );
      if (!ok) {
        return reply.code(400).send({ error });
      }
    }

    const result = await db.transaction(async (tx) => {
      let accountGroupId = body.accountGroupId;
      if (body.newAccountGroupName) {
        const [row] = await tx
          .insert(schema.accountGroups)
          .values({
            workspaceId: req.auth.workspaceId,
            name: body.newAccountGroupName,
          })
          .returning({ id: schema.accountGroups.id });
        accountGroupId = row.id;
      }

      // For loan accounts, create the plan first so the account row can
      // reference it via accounts.recurring_plan_id.
      const loanId =
        body.type === "loan"
          ? await insertLoan(tx, body.loan, body.currency, req.auth.workspaceId)
          : null;

      const [accountRow] = await tx
        .insert(schema.accounts)
        .values({
          accountGroupId: accountGroupId!,
          name: body.name,
          currency: body.currency,
          type: body.type,
          creditLimit: ccFields.creditLimit,
          defaultPayFromAccountId: ccFields.defaultPayFromAccountId,
          loanId,
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
          req.auth.workspaceId,
          body.adjustmentDate!,
        );
        const [txRow] = await tx
          .insert(schema.transactions)
          .values({
            workspaceId: req.auth.workspaceId,
            userId: req.auth.userId,
            date: body.adjustmentDate!,
            type: "adjustment",
            sortKey,
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

    const account = await findOwnedParent(
      schema.accounts,
      schema.accountGroups,
      schema.accounts.accountGroupId,
      schema.accountGroups.id,
      id,
      req.auth.workspaceId,
    );
    if (!account) return reply.code(404).send({ error: "Not found" });
    if (account.type !== body.type) {
      return reply
        .code(400)
        .send({ error: "Account type cannot be changed after creation" });
    }

    // Validate existing group pick up front; new group is created in the tx.
    if (body.accountGroupId) {
      const targetGroup = await findOwned(
        schema.accountGroups,
        body.accountGroupId,
        req.auth.workspaceId,
      );
      if (!targetGroup)
        return reply.code(400).send({ error: "Destination group not found" });
    }

    const ccFields = await resolveCcFields(
      body,
      account.currency,
      req.auth.workspaceId,
      reply,
    );
    if (ccFields === null) return;

    // Loan: pre-validate plan's pay-from up front (mirrors POST). The plan
    // row update happens inside the tx below.
    if (body.type === "loan" && body.defaultPayFromAccountId) {
      const { ok, error } = await validatePayFrom(
        body.defaultPayFromAccountId,
        req.auth.workspaceId,
        ["checking_savings", "credit_card"],
      );
      if (!ok) {
        return reply.code(400).send({ error });
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
          .values({
            workspaceId: req.auth.workspaceId,
            name: body.newGroupName,
          })
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
        if (!account.loanId) {
          throw new Error(
            `Invariant: loan account ${id} missing recurring_plan_id`,
          );
        }
        await updateRecurringPlan(
          tx,
          account.loanId,
          body.loan,
          account.currency,
          req.auth.workspaceId,
        );
      }

      if (delta !== 0n) {
        const sortKey = await nextSortKey(
          tx,
          req.auth.workspaceId,
          body.adjustmentDate!,
        );
        const [txRow] = await tx
          .insert(schema.transactions)
          .values({
            workspaceId: req.auth.workspaceId,
            userId: req.auth.userId,
            date: body.adjustmentDate!,
            type: "adjustment",
            sortKey,
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
    const account = await findOwnedParent(
      schema.accounts,
      schema.accountGroups,
      schema.accounts.accountGroupId,
      schema.accountGroups.id,
      id,
      req.auth.workspaceId,
    );
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
    const account = await findOwnedParent(
      schema.accounts,
      schema.accountGroups,
      schema.accounts.accountGroupId,
      schema.accountGroups.id,
      id,
      req.auth.workspaceId,
    );
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

    const account = await findOwnedParent(
      schema.accounts,
      schema.accountGroups,
      schema.accounts.accountGroupId,
      schema.accountGroups.id,
      id,
      req.auth.workspaceId,
    );
    if (!account) return reply.code(404).send({ error: "Not found" });

    // Soft-delete
    await db
      .update(schema.accounts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.accounts.id, id));
    return reply.code(204).send();
  });
};

/**
 * Shared select for both list and get-one. Caller passes a `where`
 * that encodes ownership + filtering (e.g., `ownedActive` for list,
 * `and(ownedActive, eq(id))` for get-one). Combining the ownership
 * check into the same query lets the get-one path skip a separate
 * `findOwned` round-trip — a missing/foreign row simply produces an
 * empty result, which the caller turns into a 404.
 */
async function fetchAccounts(
  workspaceId: string,
  id?: string,
): Promise<Account[]> {
  const rows = await db
    .select({
      id: schema.accounts.id,
      accountGroupId: schema.accounts.accountGroupId,
      name: schema.accounts.name,
      currency: schema.accounts.currency,
      type: schema.accounts.type,
      creditLimit: sql<string | null>`${schema.accounts.creditLimit}::text`.as(
        "credit_limit",
      ),
      defaultPayFromAccountId: schema.accounts.defaultPayFromAccountId,
      presentBalance: presentBalanceSql.as("present_balance"),
      availableBalance: availableBalanceSql.as("available_balance"),
      archivedAt: schema.accounts.archivedAt,
      excludeFromNetWorth: schema.accounts.excludeFromNetWorth,
      loanId: schema.loans.id,
      amountPerPeriod: sql<
        string | null
      >`${schema.loans.amountPerPeriod}::text`.as("amount_per_period"),
      frequency: schema.loans.frequency,
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
    .leftJoin(schema.loans, eq(schema.loans.id, schema.accounts.loanId))
    .innerJoin(
      schema.accountGroups,
      eq(schema.accountGroups.id, schema.accounts.accountGroupId),
    )
    .where(
      and(
        ownedParentActive(schema.accounts, schema.accountGroups, workspaceId),
        id ? eq(schema.accounts.id, id) : undefined,
      ),
    )
    .groupBy(schema.accounts.id, schema.loans.id)
    .orderBy(schema.accounts.name);

  // Enrich loans
  const loanIds = rows
    .map((r) => r.loanId)
    .filter((id): id is string => id !== null);
  const linesByPlan = await fetchLoanDefaultLines(loanIds);

  return rows.map((r) => rowToResponse(r, linesByPlan));
}

// Pending = date IS NULL.
const presentBalanceSql = sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}) FILTER (WHERE ${schema.transactions.date} IS NOT NULL), 0)`;
const availableBalanceSql = sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}), 0)`;

async function fetchLoanDefaultLines(
  loanIds: string[],
): Promise<Map<string, LoanDefaultLine[]>> {
  if (loanIds.length === 0) return new Map();

  const lineRows = await db
    .select({
      id: schema.loanDefaultLines.id,
      planId: schema.loanDefaultLines.loanId,
      categoryId: schema.loanDefaultLines.categoryId,
      categoryName: schema.categories.name,
      subcategoryId: schema.loanDefaultLines.subcategoryId,
      subcategoryName: schema.subcategories.name,
      amount: schema.loanDefaultLines.amount,
    })
    .from(schema.loanDefaultLines)
    .innerJoin(
      schema.categories,
      eq(schema.categories.id, schema.loanDefaultLines.categoryId),
    )
    .leftJoin(
      schema.subcategories,
      eq(schema.subcategories.id, schema.loanDefaultLines.subcategoryId),
    )
    .where(inArray(schema.loanDefaultLines.loanId, loanIds));

  const tagRows = lineRows.length
    ? await db
        .select({
          lineId: schema.loanDefaultLineTags.lineId,
          tagId: schema.tags.id,
          tagName: schema.tags.name,
        })
        .from(schema.loanDefaultLineTags)
        .innerJoin(
          schema.tags,
          eq(schema.tags.id, schema.loanDefaultLineTags.tagId),
        )
        .where(
          inArray(
            schema.loanDefaultLineTags.lineId,
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
      categoryId: l.categoryId,
      categoryName: l.categoryName,
      subcategoryId: l.subcategoryId,
      subcategoryName: l.subcategoryName,
      amount: l.amount === null ? null : l.amount.toString(),
      tags: (tagsByLine.get(l.id) ?? []).map((t) => ({
        id: t.tagId,
        name: t.tagName,
      })),
    }),
  );
}

function rowToResponse(
  row: AccountRow,
  linesByPlan: Map<string, LoanDefaultLine[]>,
): Account {
  const { loanId, amountPerPeriod, frequency, archivedAt, ...rest } = row;
  return {
    ...rest,
    archivedAt: archivedAt?.toISOString() ?? null,
    loan: loanId
      ? {
          id: loanId,
          amountPerPeriod: amountPerPeriod!,
          frequency: frequency!,
          defaultLines: linesByPlan.get(loanId) ?? [],
        }
      : null,
  };
}

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
  loanId: string | null;
  amountPerPeriod: string | null;
  frequency: RecurringFrequency | null;
};

async function resolveCcFields(
  body: CreateAccountBody | UpdateAccountBody,
  currency: string,
  workspaceId: string,
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
      workspaceId,
      ["checking_savings"],
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

type CcFields = {
  creditLimit: bigint | null;
  defaultPayFromAccountId: string | null;
};

async function validatePayFrom(
  payFromId: string,
  workspaceId: string,
  expectedTypes: AccountType[],
): Promise<{ ok: true; error?: never } | { ok: false; error: string }> {
  const target = await findOwnedParent(
    schema.accounts,
    schema.accountGroups,
    schema.accounts.accountGroupId,
    schema.accountGroups.id,
    payFromId,
    workspaceId,
  );
  if (!target) return { ok: false, error: "Pay-from account not found" };
  if (!expectedTypes.includes(target.type)) {
    return {
      ok: false,
      error: `Pay-from account must be a ${expectedTypes} account`,
    };
  }
  return { ok: true };
}
