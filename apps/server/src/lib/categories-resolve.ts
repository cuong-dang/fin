import type { CategoryResolverInput } from "@fin/schemas";
import { and, eq, isNull } from "drizzle-orm";

import { schema, type Tx } from "../db/index.js";

export async function resolveCategory(
  tx: Tx,
  input: CategoryResolverInput,
  kind: "income" | "expense",
  workspaceId: string,
): Promise<{ categoryId: string; subcategoryId: string | null }> {
  if (Boolean(input.categoryId) === Boolean(input.newCategoryName)) {
    throw new Error(
      "Invariant: Expect either category id or new category name.",
    );
  }
  if (Boolean(input.subcategoryId) && Boolean(input.newSubcategoryName)) {
    throw new Error(
      "Invariant: Expect either subcategory id or new subcategory name.",
    );
  }

  let categoryId = input.categoryId;
  if (input.newCategoryName) {
    categoryId = await upsertCategory(
      tx,
      kind,
      input.newCategoryName,
      workspaceId,
    );
  }

  let subcategoryId: string | null = input.subcategoryId ?? null;
  if (input.newSubcategoryName) {
    subcategoryId = await upsertSubcategory(
      tx,
      categoryId!,
      input.newSubcategoryName,
    );
  }

  return { categoryId: categoryId!, subcategoryId };
}

/**
 * Insert a category by `(workspaceId, kind, name)`, or return the
 * existing row's id if one already exists. Needed because multi-line
 * forms (bills, transactions) can reference the same `newCategoryName`
 * across several lines in one transaction; the first insert succeeds,
 * the second would trip the partial unique index. `onConflictDoNothing`
 * + a fallback SELECT picks up the row inserted earlier in the same tx.
 */
async function upsertCategory(
  tx: Tx,
  kind: "income" | "expense",
  name: string,
  workspaceId: string,
): Promise<string> {
  const [inserted] = await tx
    .insert(schema.categories)
    .values({ workspaceId, kind, name })
    .onConflictDoNothing()
    .returning({ id: schema.categories.id });
  if (inserted) return inserted.id;

  const [existing] = await tx
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.workspaceId, workspaceId),
        eq(schema.categories.kind, kind),
        eq(schema.categories.name, name),
        isNull(schema.categories.deletedAt),
      ),
    )
    .limit(1);
  return existing.id;
}

/** Subcategory analog of `upsertCategory`, keyed by `(categoryId, name)`. */
async function upsertSubcategory(
  tx: Tx,
  categoryId: string,
  name: string,
): Promise<string> {
  const [inserted] = await tx
    .insert(schema.subcategories)
    .values({ categoryId, name })
    .onConflictDoNothing()
    .returning({ id: schema.subcategories.id });
  if (inserted) return inserted.id;

  const [existing] = await tx
    .select({ id: schema.subcategories.id })
    .from(schema.subcategories)
    .where(
      and(
        eq(schema.subcategories.categoryId, categoryId),
        eq(schema.subcategories.name, name),
        isNull(schema.subcategories.deletedAt),
      ),
    )
    .limit(1);
  return existing.id;
}
