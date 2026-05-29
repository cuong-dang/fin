import {
  createTagBody,
  idParam,
  listTagsQuery,
  updateTagBody,
} from "@fin/schemas";
import { and, eq, exists, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { schema } from "../db/index.js";
import { db } from "../db/index.js";
import { findOwned } from "../lib/authz.js";

export const tagRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req) => {
    const { kind } = listTagsQuery.parse(req.query);
    if (!kind) {
      return db
        .select({ id: schema.tags.id, name: schema.tags.name })
        .from(schema.tags)
        .where(eq(schema.tags.workspaceId, req.auth.workspaceId))
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
          eq(schema.tags.workspaceId, req.auth.workspaceId),
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
      .values({ workspaceId: req.auth.workspaceId, name: body.name })
      .returning({ id: schema.tags.id, name: schema.tags.name });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateTagBody.parse(req.body);
    const owned = await findOwned(schema.tags, id, req.auth.workspaceId);
    if (!owned) return reply.code(404).send({ error: "Not found" });

    await db
      .update(schema.tags)
      .set({ name: body.name, updatedAt: new Date() })
      .where(eq(schema.tags.id, id));
    return reply.code(204).send();
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const owned = await findOwned(schema.tags, id, req.auth.workspaceId);
    if (!owned) return reply.code(404).send({ error: "Not found" });

    // Hard delete. FKs from `transaction_line_tags`,
    // `bill_default_line_tags`, and `loan_default_line_tags` cascade
    // — the tagged line / template row stays, just loses the tag.
    await db.delete(schema.tags).where(eq(schema.tags.id, id));
    return reply.code(204).send();
  });
};
