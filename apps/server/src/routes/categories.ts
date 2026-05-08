import {
  type CategoryWithSubs,
  createCategoryBody,
  createSubcategoryBody,
  idParam,
  updateCategoryBody,
  updateSubcategoryBody,
} from "@fin/schemas";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { schema } from "../db/index.js";
import { db } from "../db/index.js";
import { findOwned, findOwnedParent, ownedActive } from "../lib/authz.js";
import { groupBy } from "../lib/collections.js";

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req): Promise<CategoryWithSubs[]> => {
    const catRows = await db
      .select({
        id: schema.categories.id,
        kind: schema.categories.kind,
        name: schema.categories.name,
      })
      .from(schema.categories)
      .where(ownedActive(schema.categories, req.auth.workspaceId))
      .orderBy(schema.categories.name);

    const catIds = catRows.map((c) => c.id);
    const subRows =
      catIds.length > 0
        ? await db
            .select({
              id: schema.subcategories.id,
              categoryId: schema.subcategories.categoryId,
              name: schema.subcategories.name,
            })
            .from(schema.subcategories)
            .where(
              and(
                inArray(schema.subcategories.categoryId, catIds),
                isNull(schema.subcategories.deletedAt),
              ),
            )
            .orderBy(schema.subcategories.name)
        : [];
    const subsByCategory = groupBy(subRows, (s) => s.categoryId);
    return catRows.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      subcategories: (subsByCategory.get(c.id) ?? []).map((s) => ({
        id: s.id,
        name: s.name,
      })),
    }));
  });

  app.post("/", async (req, reply) => {
    const body = createCategoryBody.parse(req.body);
    const [row] = await db
      .insert(schema.categories)
      .values({
        workspaceId: req.auth.workspaceId,
        kind: body.kind,
        name: body.name,
      })
      .returning({
        id: schema.categories.id,
        kind: schema.categories.kind,
        name: schema.categories.name,
      });
    return reply.code(201).send({ ...row, subcategories: [] });
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateCategoryBody.parse(req.body);
    const existing = await findOwned(
      schema.categories,
      id,
      req.auth.workspaceId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });

    await db
      .update(schema.categories)
      .set({ name: body.name, updatedAt: new Date() })
      .where(eq(schema.categories.id, id));
    return reply.code(204).send();
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwned(
      schema.categories,
      id,
      req.auth.workspaceId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });

    // Soft-delete
    await db
      .update(schema.categories)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.categories.id, id));
    return reply.code(204).send();
  });

  // ─── Subcategories (nested under a category) ────────────────────────────

  app.post("/:id/subcategories", async (req, reply) => {
    const { id: categoryId } = idParam.parse(req.params);
    const body = createSubcategoryBody.parse(req.body);
    const parent = await findOwned(
      schema.categories,
      categoryId,
      req.auth.workspaceId,
    );
    if (!parent) return reply.code(404).send({ error: "Category not found" });

    const [row] = await db
      .insert(schema.subcategories)
      .values({ categoryId, name: body.name })
      .returning({
        id: schema.subcategories.id,
        name: schema.subcategories.name,
      });
    return reply.code(201).send(row);
  });
};

/**
 * Subcategory-only routes mounted at /api/subcategories. Separate plugin so
 * they don't need a parent category in the path for update/delete.
 */
export const subcategoryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateSubcategoryBody.parse(req.body);
    const existing = await findOwnedParent(
      schema.subcategories,
      schema.categories,
      schema.subcategories.categoryId,
      schema.categories.id,
      id,
      req.auth.workspaceId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });

    await db
      .update(schema.subcategories)
      .set({ name: body.name, updatedAt: new Date() })
      .where(eq(schema.subcategories.id, id));
    return reply.code(204).send();
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwnedParent(
      schema.subcategories,
      schema.categories,
      schema.subcategories.categoryId,
      schema.categories.id,
      id,
      req.auth.workspaceId,
    );
    if (!existing) return reply.code(404).send({ error: "Not found" });

    await db
      .update(schema.subcategories)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.subcategories.id, id));
    return reply.code(204).send();
  });
};
