import { schema } from "../db";
import {
  createAccountGroupBody,
  idParam,
  updateAccountGroupBody,
} from "@fin/schemas";
import { eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db";
import { findOwned } from "../lib/authz";

export const accountGroupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req) => {
    return db
      .select({ id: schema.accountGroups.id, name: schema.accountGroups.name })
      .from(schema.accountGroups)
      .where(eq(schema.accountGroups.groupId, req.auth.groupId))
      .orderBy(schema.accountGroups.name);
  });

  app.post("/", async (req, reply) => {
    const body = createAccountGroupBody.parse(req.body);
    const [row] = await db
      .insert(schema.accountGroups)
      .values({ groupId: req.auth.groupId, name: body.name })
      .returning({
        id: schema.accountGroups.id,
        name: schema.accountGroups.name,
      });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateAccountGroupBody.parse(req.body);

    const existing = await findOwned(
      schema.accountGroups,
      id,
      req.auth.groupId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });

    const [row] = await db
      .update(schema.accountGroups)
      .set({ name: body.name, updatedAt: new Date() })
      .where(eq(schema.accountGroups.id, id))
      .returning({
        id: schema.accountGroups.id,
        name: schema.accountGroups.name,
      });
    return row;
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);

    const existing = await findOwned(
      schema.accountGroups,
      id,
      req.auth.groupId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });

    // accounts.account_group_id is ON DELETE RESTRICT — pre-check so the
    // error message is useful rather than a raw FK violation.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.accounts)
      .where(eq(schema.accounts.accountGroupId, id));
    if (count > 0) {
      return reply.code(409).send({
        error: `Cannot delete group: ${count} account(s) still reference it`,
      });
    }

    await db
      .delete(schema.accountGroups)
      .where(eq(schema.accountGroups.id, id));
    return reply.code(204).send();
  });
};
