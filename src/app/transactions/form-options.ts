import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, subcategories, tags } from "@/db/schema";
import { groupBy } from "@/lib/collections";
import type {
  AccountOption,
  CategoryOption,
  TagOption,
} from "./transaction-form";

/**
 * Load the option lists the transaction form needs: accounts, categories
 * (with attached subcategories), and tags — all scoped to the workspace.
 */
export async function loadTransactionFormOptions(workspaceGroupId: string): Promise<{
  accounts: AccountOption[];
  categories: CategoryOption[];
  tags: TagOption[];
}> {
  const [accountRows, categoryRows, tagRows] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        currency: accounts.currency,
      })
      .from(accounts)
      .where(eq(accounts.groupId, workspaceGroupId))
      .orderBy(accounts.name),
    db
      .select({
        id: categories.id,
        kind: categories.kind,
        name: categories.name,
      })
      .from(categories)
      .where(eq(categories.groupId, workspaceGroupId))
      .orderBy(categories.name),
    db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.groupId, workspaceGroupId))
      .orderBy(tags.name),
  ]);

  const catIds = categoryRows.map((c) => c.id);
  const subcatRows =
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
  const subcatsByCategory = groupBy(subcatRows, (s) => s.categoryId);

  return {
    accounts: accountRows,
    categories: categoryRows.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      subcategories: subcatsByCategory.get(c.id) ?? [],
    })),
    tags: tagRows,
  };
}
