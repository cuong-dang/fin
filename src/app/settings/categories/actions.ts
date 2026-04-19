"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { categories, subcategories, transactionLines } from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { getCurrentSession } from "@/lib/session";

const nameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const kindSchema = z.enum(["income", "expense"]);

// ─── Categories ───────────────────────────────────────────────────────────

export async function createCategory(
  kindValue: "income" | "expense",
  formData: FormData,
) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");
  const { name } = nameSchema.parse({ name: formData.get("name") });
  const kind = kindSchema.parse(kindValue);

  await db.insert(categories).values({ groupId: session.groupId, kind, name });
  revalidatePath("/settings/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");
  const { name } = nameSchema.parse({ name: formData.get("name") });

  const existing = await findOwned(categories, id, session.groupId);
  if (!existing) throw new Error("Category not found");

  await db
    .update(categories)
    .set({ name, updatedAt: new Date() })
    .where(eq(categories.id, id));
  revalidatePath("/settings/categories");
}

export async function deleteCategory(id: string) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const existing = await findOwned(categories, id, session.groupId);
  if (!existing) throw new Error("Category not found");

  // transaction_lines.category_id is ON DELETE RESTRICT. Subcategories of
  // this category cascade-delete, but lines referencing them are also
  // RESTRICT-ed. Pre-check both in one sweep for a helpful error.
  const subRows = await db
    .select({ id: subcategories.id })
    .from(subcategories)
    .where(eq(subcategories.categoryId, id));
  const subIds = subRows.map((s) => s.id);

  const [directCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactionLines)
    .where(eq(transactionLines.categoryId, id));
  const subCount =
    subIds.length === 0
      ? { count: 0 }
      : (
          await db
            .select({ count: sql<number>`count(*)::int` })
            .from(transactionLines)
            .where(inArray(transactionLines.subcategoryId, subIds))
        )[0];
  const total = directCount.count + subCount.count;
  if (total > 0) {
    throw new Error(
      `Cannot delete: ${total} transaction line(s) reference this category or its subcategories`,
    );
  }

  // Subcategories cascade; lines we've already verified are absent.
  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/settings/categories");
}

// ─── Subcategories ────────────────────────────────────────────────────────

export async function createSubcategory(
  categoryId: string,
  formData: FormData,
) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");
  const { name } = nameSchema.parse({ name: formData.get("name") });

  const parent = await findOwned(categories, categoryId, session.groupId);
  if (!parent) throw new Error("Category not found");

  await db.insert(subcategories).values({ categoryId, name });
  revalidatePath("/settings/categories");
}

export async function updateSubcategory(id: string, formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");
  const { name } = nameSchema.parse({ name: formData.get("name") });

  // Subcategory ownership is via its parent category. Join to verify.
  const [row] = await db
    .select({
      id: subcategories.id,
      parentGroupId: categories.groupId,
    })
    .from(subcategories)
    .innerJoin(categories, eq(categories.id, subcategories.categoryId))
    .where(eq(subcategories.id, id))
    .limit(1);
  if (!row || row.parentGroupId !== session.groupId) {
    throw new Error("Subcategory not found");
  }

  await db
    .update(subcategories)
    .set({ name, updatedAt: new Date() })
    .where(eq(subcategories.id, id));
  revalidatePath("/settings/categories");
}

export async function deleteSubcategory(id: string) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const [row] = await db
    .select({
      id: subcategories.id,
      parentGroupId: categories.groupId,
    })
    .from(subcategories)
    .innerJoin(categories, eq(categories.id, subcategories.categoryId))
    .where(eq(subcategories.id, id))
    .limit(1);
  if (!row || row.parentGroupId !== session.groupId) {
    throw new Error("Subcategory not found");
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactionLines)
    .where(eq(transactionLines.subcategoryId, id));
  if (count > 0) {
    throw new Error(
      `Cannot delete: ${count} transaction line(s) reference this subcategory`,
    );
  }

  await db.delete(subcategories).where(eq(subcategories.id, id));
  revalidatePath("/settings/categories");
}
