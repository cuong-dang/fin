import { schema } from "../db";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db";

export const tagRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req) => {
    return db
      .select({ id: schema.tags.id, name: schema.tags.name })
      .from(schema.tags)
      .where(eq(schema.tags.groupId, req.auth.groupId))
      .orderBy(schema.tags.name);
  });
};
