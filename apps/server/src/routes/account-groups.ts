import type { AccountGroup } from "@fin/schemas";
import {
  createAccountGroupBody,
  idParam,
  updateAccountGroupBody,
} from "@fin/schemas";
import { eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { schema } from "../db/index.js";
import { db } from "../db/index.js";
import { findOwned, isActive, listOwnedActive } from "../lib/authz.js";

export const accountGroupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req): Promise<AccountGroup[]> => {
    return listOwnedActive(
      schema.accountGroups,
      req.auth.workspaceId,
      schema.accountGroups.name,
    );
  });

  app.post("/", async (req, reply): Promise<FastifyReply> => {
    const body = createAccountGroupBody.parse(req.body);
    const [row] = await db
      .insert(schema.accountGroups)
      .values({ workspaceId: req.auth.workspaceId, name: body.name })
      .returning({
        id: schema.accountGroups.id,
        name: schema.accountGroups.name,
      });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply): Promise<AccountGroup> => {
    const { id } = idParam.parse(req.params);
    const body = updateAccountGroupBody.parse(req.body);

    const existing = await findOwned(
      schema.accountGroups,
      schema.accountGroups.id,
      id,
      req.auth.workspaceId,
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

  app.delete("/:id", async (req, reply): Promise<FastifyReply> => {
    const { id } = idParam.parse(req.params);

    const existing = await findOwned(
      schema.accountGroups,
      schema.accountGroups.id,
      id,
      req.auth.workspaceId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });

    // Soft-delete blocks if any *active* account still references the group
    // — otherwise those accounts would point at a hidden parent and end up
    // orphaned-looking in the UI. User must move or soft-delete them first.
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.accounts)
      .where(isActive(schema.accounts, id));
    if (countRow.count > 0) {
      return reply.code(409).send({
        error: `Cannot delete group: ${countRow.count} active account(s) still reference it`,
      });
    }

    await db
      .update(schema.accountGroups)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.accountGroups.id, id));
    return reply.code(204).send();
  });
};
