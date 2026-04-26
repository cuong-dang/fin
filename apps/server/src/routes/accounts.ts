import {
  type CreateAccountBody,
  createAccountBody,
  idParam,
  type UpdateAccountBody,
  updateAccountBody,
} from "@fin/schemas";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { schema } from "../db";
import { db } from "../db";
import { findOwned, ownedActive } from "../lib/authz";
import { parseMoney } from "../lib/money";
import { nextSortKey } from "../lib/transactions-order";

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // Pending = date IS NULL. Hard-deleted transactions take their legs
  // with them, so we don't need a deleted_at filter here.
  const presentBalanceSql = sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}) FILTER (WHERE ${schema.transactions.date} IS NOT NULL), 0)`;
  const availableBalanceSql = sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}), 0)`;

  /** List active accounts with present + available balance. */
  app.get("/", async (req) => {
    return db
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
      .where(ownedActive(schema.accounts, req.auth.groupId))
      .groupBy(schema.accounts.id)
      .orderBy(schema.accounts.name);
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
      .where(eq(schema.accounts.id, id))
      .groupBy(schema.accounts.id);
    return row;
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

    const result = await db.transaction(async (tx) => {
      let accountGroupId = body.accountGroupId;
      if (body.newGroupName) {
        const [row] = await tx
          .insert(schema.accountGroups)
          .values({ groupId: req.auth.groupId, name: body.newGroupName })
          .returning({ id: schema.accountGroups.id });
        accountGroupId = row.id;
      }

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
          updatedAt: new Date(),
        })
        .where(eq(schema.accounts.id, id));

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
