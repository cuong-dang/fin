import { createTagBody, idParam, updateTagBody } from "@fin/schemas";
import { and, eq, exists, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { schema } from "../db";
import { db } from "../db";
import { findOwned, ownedActive } from "../lib/authz";

const listTagsQuery = z.object({
  // When set, restricts the result to tags that have been used on at
  // least one line of that category kind. Used by analytics charts so
  // the tag picker doesn't surface tags irrelevant to the current
  // direction (e.g., expense-only tags while viewing income).
  kind: z.enum(["expense", "income"]).optional(),
});

export const tagRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req) => {
    const { kind } = listTagsQuery.parse(req.query);
    if (!kind) {
      return db
        .select({ id: schema.tags.id, name: schema.tags.name })
        .from(schema.tags)
        .where(ownedActive(schema.tags, req.auth.groupId))
        .orderBy(schema.tags.name);
    }
    // Filter via EXISTS on the tag→line→category chain. Same shape as
    // the analytics route's tag filter — keeps the row count stable
    // and avoids deduping in JS.
    return db
      .select({ id: schema.tags.id, name: schema.tags.name })
      .from(schema.tags)
      .where(
        and(
          ownedActive(schema.tags, req.auth.groupId),
          exists(
            db
              .select({ one: sql`1` })
              .from(schema.transactionLineTags)
              .innerJoin(
                schema.transactionLines,
                eq(
                  schema.transactionLines.id,
                  schema.transactionLineTags.lineId,
                ),
              )
              .innerJoin(
                schema.transactions,
                eq(
                  schema.transactions.id,
                  schema.transactionLines.transactionId,
                ),
              )
              .where(
                and(
                  eq(schema.transactionLineTags.tagId, schema.tags.id),
                  eq(schema.transactions.type, kind),
                ),
              ),
          ),
        ),
      )
      .orderBy(schema.tags.name);
  });

  app.post("/", async (req, reply) => {
    const body = createTagBody.parse(req.body);
    const [row] = await db
      .insert(schema.tags)
      .values({ groupId: req.auth.groupId, name: body.name })
      .returning({ id: schema.tags.id, name: schema.tags.name });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateTagBody.parse(req.body);
    const owned = await findOwned(schema.tags, id, req.auth.groupId);
    if (!owned) return reply.code(404).send({ error: "Not found" });

    await db
      .update(schema.tags)
      .set({ name: body.name, updatedAt: new Date() })
      .where(eq(schema.tags.id, id));
    return reply.code(204).send();
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const owned = await findOwned(schema.tags, id, req.auth.groupId);
    if (!owned) return reply.code(404).send({ error: "Not found" });

    // Soft-delete: junction rows on transaction_line_tags etc. stay intact
    // (FK is RESTRICT), so historical tx displays still resolve the tag.
    await db
      .update(schema.tags)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.tags.id, id));
    return reply.code(204).send();
  });
};
