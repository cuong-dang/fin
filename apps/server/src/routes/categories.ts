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

import { schema } from "../db";
import { db } from "../db";
import { findOwned, ownedActive } from "../lib/authz";
import { groupBy } from "../lib/collections";

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  /** List active categories for the workspace with active subcategories nested. */
  app.get("/", async (req): Promise<CategoryWithSubs[]> => {
    const catRows = await db
      .select({
        id: schema.categories.id,
        kind: schema.categories.kind,
        name: schema.categories.name,
      })
      .from(schema.categories)
      .where(ownedActive(schema.categories, req.auth.groupId))
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

    // Soft-delete: subcategories aren't cascaded; the list query filters
    // them out via their parent's deleted_at, and they remain individually
    // available for manual restoration if needed. tx_lines that reference
    // this category stay intact and still display its name on history.
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

  /**
   * Subcategories don't carry their own group_id — they inherit via parent
   * category. We also enforce that both the subcategory and its parent are
   * not soft-deleted (a subcategory under a deleted category is hidden).
   */
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
      .where(
        and(
          eq(schema.subcategories.id, id),
          isNull(schema.subcategories.deletedAt),
          isNull(schema.categories.deletedAt),
        ),
      )
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

    await db
      .update(schema.subcategories)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.subcategories.id, id));
    return reply.code(204).send();
  });
};
