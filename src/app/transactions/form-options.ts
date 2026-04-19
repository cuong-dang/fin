import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, tags } from "@/db/schema";
import { loadCategoriesWithSubs } from "@/lib/categories";
import type {
  AccountOption,
  CategoryOption,
  TagOption,
} from "./transaction-form";

/**
 * Load the option lists the transaction form needs: accounts, categories
 * (with attached subcategories), and tags — all scoped to the workspace.
 */
export async function loadTransactionFormOptions(
  workspaceGroupId: string,
): Promise<{
  accounts: AccountOption[];
  categories: CategoryOption[];
  tags: TagOption[];
}> {
  const [accountRows, categoriesWithSubs, tagRows] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        currency: accounts.currency,
      })
      .from(accounts)
      .where(eq(accounts.groupId, workspaceGroupId))
      .orderBy(accounts.name),
    loadCategoriesWithSubs(workspaceGroupId),
    db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.groupId, workspaceGroupId))
      .orderBy(tags.name),
  ]);

  return {
    accounts: accountRows,
    categories: categoriesWithSubs,
    tags: tagRows,
  };
}
