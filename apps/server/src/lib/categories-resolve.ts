import type { CategoryResolverInput } from "@fin/schemas";

import { schema, type Tx } from "../db/index.js";

export async function resolveCategory(
  tx: Tx,
  input: CategoryResolverInput,
  kind: "income" | "expense",
  workspaceId: string,
): Promise<{ categoryId: string; subcategoryId: string | null }> {
  if (Boolean(input.categoryId) === Boolean(input.newCategoryName)) {
    throw new Error("Invariant: Expect either category id or new category name.");
  }
  if (Boolean(input.subcategoryId) && Boolean(input.newSubcategoryName)) {
    throw new Error("Invariant: Expect either subcategory id or new subcategory name.");
  }

  let categoryId = input.categoryId;
  if (input.newCategoryName) {
    const [row] = await tx
      .insert(schema.categories)
      .values({ workspaceId: workspaceId, kind, name: input.newCategoryName })
      .returning({ id: schema.categories.id });
    categoryId = row.id;
  }

  let subcategoryId: string | null = input.subcategoryId ?? null;
  if (input.newSubcategoryName) {
    const [row] = await tx
      .insert(schema.subcategories)
      .values({ categoryId: categoryId!, name: input.newSubcategoryName })
      .returning({ id: schema.subcategories.id });
    subcategoryId = row.id;
  }

  return { categoryId: categoryId!, subcategoryId };
}
