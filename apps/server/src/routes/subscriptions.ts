import {
  createSubscriptionBody,
  idParam,
  type Subscription,
  type SubscriptionDefaultLine,
  type SubscriptionDefaultLineBody,
  updateSubscriptionBody,
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

export const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // ─── List ────────────────────────────────────────────────────────────────

  app.get("/", async (req): Promise<Subscription[]> => {
    const subs = await listOwnedActive(
      schema.subscriptions,
      req.auth.groupId,
      schema.subscriptions.name,
    );
    if (subs.length === 0) return [];
    const linesBySub = await fetchDefaultLines(subs.map((s) => s.id));
    return subs.map((s) => toResponse(s, linesBySub.get(s.id) ?? []));
  });

  // ─── Get one ─────────────────────────────────────────────────────────────

  app.get("/:id", async (req, reply): Promise<Subscription | undefined> => {
    const { id } = idParam.parse(req.params);
    const sub = await findOwned(schema.subscriptions, id, req.auth.groupId);
    if (!sub) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    const linesBySub = await fetchDefaultLines([id]);
    return toResponse(sub, linesBySub.get(id) ?? []);
  });

  // ─── Create ─────────────────────────────────────────────────────────────

  app.post("/", async (req, reply) => {
    const body = createSubscriptionBody.parse(req.body);
    if (body.defaultAccountId) {
      const account = await findOwned(
        schema.accounts,
        body.defaultAccountId,
        req.auth.groupId,
      );
      if (!account) {
        return reply
          .code(400)
          .send({ error: "Default account not found in this workspace" });
      }
    }

    const result = await db.transaction(async (tx) => {
      const [subRow] = await tx
        .insert(schema.subscriptions)
        .values({
          groupId: req.auth.groupId,
          name: body.name,
          currency: body.currency,
          frequency: body.frequency,
          firstChargeDate: body.firstChargeDate,
          defaultAccountId: body.defaultAccountId ?? null,
          description: body.description ?? null,
        })
        .returning({ id: schema.subscriptions.id });

      await insertDefaultLines(
        tx,
        subRow.id,
        body.defaultLines,
        body.currency,
        req.auth.groupId,
      );
      return subRow;
    });
    return reply.code(201).send(result);
  });

  // ─── Update (rewrite) ────────────────────────────────────────────────────

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateSubscriptionBody.parse(req.body);
    const existing = await findOwned(
      schema.subscriptions,
      id,
      req.auth.groupId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (body.defaultAccountId) {
      const account = await findOwned(
        schema.accounts,
        body.defaultAccountId,
        req.auth.groupId,
      );
      if (!account) {
        return reply
          .code(400)
          .send({ error: "Default account not found in this workspace" });
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.subscriptions)
        .set({
          name: body.name,
          currency: body.currency,
          frequency: body.frequency,
          firstChargeDate: body.firstChargeDate,
          defaultAccountId: body.defaultAccountId ?? null,
          description: body.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.id, id));

      // Rewrite lines: junction tag rows cascade off the lines.
      await tx
        .delete(schema.subscriptionDefaultLines)
        .where(eq(schema.subscriptionDefaultLines.subscriptionId, id));
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
    const existing = await findOwned(
      schema.subscriptions,
      id,
      req.auth.groupId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.cancelledAt !== null) {
      return reply.code(409).send({ error: "Already cancelled" });
    }
    await db
      .update(schema.subscriptions)
      .set({ cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, id));
    return reply.code(204).send();
  });

  // ─── Delete ──────────────────────────────────────────────────────────────

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwned(
      schema.subscriptions,
      id,
      req.auth.groupId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });
    // Soft-delete: past transactions still link to this subscription via
    // transactions.subscription_id (RESTRICT FK) and continue to display
    // its name. Default lines + tag links remain intact for history.
    await db
      .update(schema.subscriptions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, id));
    return reply.code(204).send();
  });
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchDefaultLines(
  subIds: string[],
): Promise<Map<string, SubscriptionDefaultLine[]>> {
  if (subIds.length === 0) return new Map();
  const lineRows = await db
    .select({
      id: schema.subscriptionDefaultLines.id,
      subscriptionId: schema.subscriptionDefaultLines.subscriptionId,
      amount: schema.subscriptionDefaultLines.amount,
      currency: schema.subscriptionDefaultLines.currency,
      categoryId: schema.subscriptionDefaultLines.categoryId,
      categoryName: schema.categories.name,
      subcategoryId: schema.subscriptionDefaultLines.subcategoryId,
      subcategoryName: schema.subcategories.name,
      description: schema.subscriptionDefaultLines.description,
    })
    .from(schema.subscriptionDefaultLines)
    .innerJoin(
      schema.categories,
      eq(schema.categories.id, schema.subscriptionDefaultLines.categoryId),
    )
    .leftJoin(
      schema.subcategories,
      eq(
        schema.subcategories.id,
        schema.subscriptionDefaultLines.subcategoryId,
      ),
    )
    .where(inArray(schema.subscriptionDefaultLines.subscriptionId, subIds));

  const tagRows = await db
    .select({
      lineId: schema.subscriptionDefaultLineTags.lineId,
      tagId: schema.tags.id,
      tagName: schema.tags.name,
    })
    .from(schema.subscriptionDefaultLineTags)
    .innerJoin(
      schema.tags,
      eq(schema.tags.id, schema.subscriptionDefaultLineTags.tagId),
    )
    .where(
      inArray(
        schema.subscriptionDefaultLineTags.lineId,
        lineRows.map((l) => l.id),
      ),
    )
    .orderBy(schema.tags.name);
  const tagsByLine = groupBy(tagRows, (t) => t.lineId);

  const out = new Map<string, SubscriptionDefaultLine[]>();
  for (const l of lineRows) {
    const line: SubscriptionDefaultLine = {
      id: l.id,
      amount: l.amount.toString(),
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
    };
    const list = out.get(l.subscriptionId);
    if (list) list.push(line);
    else out.set(l.subscriptionId, [line]);
  }
  return out;
}

async function insertDefaultLines(
  tx: Tx,
  subscriptionId: string,
  lines: SubscriptionDefaultLineBody[],
  currency: string,
  workspaceGroupId: string,
): Promise<void> {
  if (lines.length === 0) {
    throw new Error("At least one default line is required");
  }
  // Parse amounts up front so a bad line aborts before any write.
  const amounts = lines.map((l) => parseMoney(l.amount, currency));
  if (amounts.some((m) => m <= 0n)) {
    throw new Error("Each default line amount must be positive");
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Subscriptions are always expense-side; pass that to the resolver so
    // an inline-created category gets the right kind.
    const { categoryId, subcategoryId } = await resolveCategory(
      tx,
      line,
      "expense",
      workspaceGroupId,
    );
    const [row] = await tx
      .insert(schema.subscriptionDefaultLines)
      .values({
        subscriptionId,
        categoryId,
        subcategoryId,
        amount: amounts[i],
        currency,
      })
      .returning({ id: schema.subscriptionDefaultLines.id });

    if (line.tagNames && line.tagNames.length > 0) {
      const byName = await upsertTags(tx, line.tagNames, workspaceGroupId);
      const unique = [...new Set(line.tagNames)];
      await tx.insert(schema.subscriptionDefaultLineTags).values(
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
  sub: typeof schema.subscriptions.$inferSelect,
  defaultLines: SubscriptionDefaultLine[],
): Subscription {
  return {
    id: sub.id,
    name: sub.name,
    currency: sub.currency,
    frequency: sub.frequency,
    firstChargeDate: sub.firstChargeDate,
    defaultAccountId: sub.defaultAccountId,
    cancelledAt: sub.cancelledAt?.toISOString() ?? null,
    description: sub.description,
    defaultLines,
  };
}
