import { createTagBody, idParam, updateTagBody } from "@fin/schemas";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { schema } from "../db";
import { db } from "../db";
import { findOwned, ownedActive } from "../lib/authz";

export const tagRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req) => {
    return db
      .select({ id: schema.tags.id, name: schema.tags.name })
      .from(schema.tags)
      .where(ownedActive(schema.tags, req.auth.groupId))
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
