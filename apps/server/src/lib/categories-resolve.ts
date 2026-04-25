import { db, schema } from "../db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * One categorized line's category/subcategory inputs — shared by transaction
 * lines and subscription/recurring-plan default lines. The form passes
 * either an existing id or a new name (the inline-create path); the
 * resolver inserts the new row and returns the resulting ids.
 */
export type CategoryResolverInput = {
  categoryId?: string;
  newCategoryName?: string;
  subcategoryId?: string;
  newSubcategoryName?: string;
};

/**
 * Resolve a line's category/subcategory: insert any inline-named new rows,
 * then return the resolved ids. The caller supplies `kind` because new
 * categories must be tagged income vs. expense — for sub/recurring default
 * lines that's always "expense".
 *
 * Throws if no category id and no new-category name was provided.
 */
export async function resolveCategory(
  tx: Tx,
  input: CategoryResolverInput,
  kind: "income" | "expense",
  workspaceGroupId: string,
): Promise<{ categoryId: string; subcategoryId: string | null }> {
  let categoryId = input.categoryId;
  if (input.newCategoryName) {
    const [row] = await tx
      .insert(schema.categories)
      .values({ groupId: workspaceGroupId, kind, name: input.newCategoryName })
      .returning({ id: schema.categories.id });
    categoryId = row.id;
  }
  if (!categoryId) {
    throw new Error("Category is required (pick one or name a new one)");
  }

  let subcategoryId: string | null = input.subcategoryId ?? null;
  if (input.newSubcategoryName) {
    const [row] = await tx
      .insert(schema.subcategories)
      .values({ categoryId, name: input.newSubcategoryName })
      .returning({ id: schema.subcategories.id });
    subcategoryId = row.id;
  }

  return { categoryId, subcategoryId };
}
