import { createAccountBody, idParam, updateAccountBody } from "@fin/schemas";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { schema } from "../db";
import { db } from "../db";
import { findOwned } from "../lib/authz";
import { parseMoney } from "../lib/money";
import { nextSortKey } from "../lib/transactions-order";

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  /** List accounts with present + available balance. */
  app.get("/", async (req) => {
    return db
      .select({
        id: schema.accounts.id,
        accountGroupId: schema.accounts.accountGroupId,
        name: schema.accounts.name,
        currency: schema.accounts.currency,
        presentBalance:
          sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}) FILTER (WHERE ${schema.transactions.date} IS NOT NULL), 0)`.as(
            "present_balance",
          ),
        availableBalance:
          sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}), 0)`.as(
            "available_balance",
          ),
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
      .where(eq(schema.accounts.groupId, req.auth.groupId))
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
        presentBalance:
          sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}) FILTER (WHERE ${schema.transactions.date} IS NOT NULL), 0)`.as(
            "present_balance",
          ),
        availableBalance:
          sql<string>`COALESCE(SUM(${schema.transactionLegs.amount}), 0)`.as(
            "available_balance",
          ),
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
    if (!body.accountGroupId && !body.newGroupName) {
      return reply
        .code(400)
        .send({ error: "Select an existing group or name a new one" });
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
        })
        .returning({
          id: schema.accounts.id,
          accountGroupId: schema.accounts.accountGroupId,
          name: schema.accounts.name,
          currency: schema.accounts.currency,
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
    if (!body.accountGroupId && !body.newGroupName) {
      return reply
        .code(400)
        .send({ error: "Select an existing group or name a new one" });
    }

    const account = await findOwned(schema.accounts, id, req.auth.groupId);
    if (!account) return reply.code(404).send({ error: "Not found" });

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

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.transactionLegs)
      .where(eq(schema.transactionLegs.accountId, id));
    if (count > 0) {
      return reply.code(409).send({
        error: `Cannot delete account: ${count} transaction leg(s) reference it`,
      });
    }

    await db.delete(schema.accounts).where(eq(schema.accounts.id, id));
    return reply.code(204).send();
  });
};
