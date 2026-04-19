import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, subcategories } from "@/db/schema";
import { groupBy } from "./collections";

export type CategoryWithSubs = {
  id: string;
  kind: "income" | "expense";
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};

/**
 * Load all categories in a workspace with their subcategories nested.
 * Ordered by category name, then subcategory name. Shared by the settings
 * page and the transaction form's option loader.
 */
export async function loadCategoriesWithSubs(
  workspaceGroupId: string,
): Promise<CategoryWithSubs[]> {
  const catRows = await db
    .select({
      id: categories.id,
      kind: categories.kind,
      name: categories.name,
    })
    .from(categories)
    .where(eq(categories.groupId, workspaceGroupId))
    .orderBy(categories.name);

  const catIds = catRows.map((c) => c.id);
  const subRows =
    catIds.length > 0
      ? await db
          .select({
            id: subcategories.id,
            categoryId: subcategories.categoryId,
            name: subcategories.name,
          })
          .from(subcategories)
          .where(inArray(subcategories.categoryId, catIds))
          .orderBy(subcategories.name)
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
}
