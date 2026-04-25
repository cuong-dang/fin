import {
  type CategoryWithSubs,
  createCategoryBody,
  createSubcategoryBody,
  idParam,
  updateCategoryBody,
  updateSubcategoryBody,
} from "@fin/schemas";
import { eq, inArray, or, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { schema } from "../db";
import { db } from "../db";
import { findOwned } from "../lib/authz";
import { groupBy } from "../lib/collections";

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  /** List all categories for the workspace with subcategories nested. */
  app.get("/", async (req): Promise<CategoryWithSubs[]> => {
    const catRows = await db
      .select({
        id: schema.categories.id,
        kind: schema.categories.kind,
        name: schema.categories.name,
      })
      .from(schema.categories)
      .where(eq(schema.categories.groupId, req.auth.groupId))
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
            .where(inArray(schema.subcategories.categoryId, catIds))
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
        groupId: req.auth.groupId,
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
    const existing = await findOwned(schema.categories, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });

    await db
      .update(schema.categories)
      .set({ name: body.name, updatedAt: new Date() })
      .where(eq(schema.categories.id, id));
    return reply.code(204).send();
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwned(schema.categories, id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });

    // transaction_lines.category_id AND transaction_lines.subcategory_id are
    // both ON DELETE RESTRICT. Check both in one sweep so we give a useful
    // error rather than a raw FK violation.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.transactionLines)
      .leftJoin(
        schema.subcategories,
        eq(schema.subcategories.id, schema.transactionLines.subcategoryId),
      )
      .where(
        or(
          eq(schema.transactionLines.categoryId, id),
          eq(schema.subcategories.categoryId, id),
        ),
      );
    if (count > 0) {
      return reply.code(409).send({
        error: `Cannot delete: ${count} transaction line(s) reference this category or its subcategories`,
      });
    }
    // Subcategories cascade.
    await db.delete(schema.categories).where(eq(schema.categories.id, id));
    return reply.code(204).send();
  });

  // ─── Subcategories (nested under a category) ────────────────────────────

  app.post("/:id/subcategories", async (req, reply) => {
    const { id: categoryId } = idParam.parse(req.params);
    const body = createSubcategoryBody.parse(req.body);
    const parent = await findOwned(
      schema.categories,
      categoryId,
      req.auth.groupId,
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

  async function findOwnedSubcategory(id: string, workspaceGroupId: string) {
    const [row] = await db
      .select({
        id: schema.subcategories.id,
        parentGroupId: schema.categories.groupId,
      })
      .from(schema.subcategories)
      .innerJoin(
        schema.categories,
        eq(schema.categories.id, schema.subcategories.categoryId),
      )
      .where(eq(schema.subcategories.id, id))
      .limit(1);
    if (!row || row.parentGroupId !== workspaceGroupId) return null;
    return row;
  }

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateSubcategoryBody.parse(req.body);
    const existing = await findOwnedSubcategory(id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });

    await db
      .update(schema.subcategories)
      .set({ name: body.name, updatedAt: new Date() })
      .where(eq(schema.subcategories.id, id));
    return reply.code(204).send();
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existing = await findOwnedSubcategory(id, req.auth.groupId);
    if (!existing) return reply.code(404).send({ error: "Not found" });

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.transactionLines)
      .where(eq(schema.transactionLines.subcategoryId, id));
    if (count > 0) {
      return reply.code(409).send({
        error: `Cannot delete: ${count} transaction line(s) reference this subcategory`,
      });
    }
    await db
      .delete(schema.subcategories)
      .where(eq(schema.subcategories.id, id));
    return reply.code(204).send();
  });
};
