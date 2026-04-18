import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, subcategories, tags } from "@/db/schema";
import { groupBy } from "@/lib/collections";
import { getCurrentSession } from "@/lib/session";
import {
  type AccountOption,
  type CategoryOption,
  type TagOption,
  NewTransactionForm,
} from "./new-transaction-form";

export default async function NewTransactionPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const [accountsRows, categoryRows, tagsRows] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        currency: accounts.currency,
      })
      .from(accounts)
      .where(eq(accounts.groupId, session.groupId))
      .orderBy(accounts.name),
    db
      .select({
        id: categories.id,
        kind: categories.kind,
        name: categories.name,
      })
      .from(categories)
      .where(eq(categories.groupId, session.groupId))
      .orderBy(categories.name),
    db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.groupId, session.groupId))
      .orderBy(tags.name),
  ]);

  // Attach subcategories to categories.
  const catIds = categoryRows.map((c) => c.id);
  const subcatsRows =
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

  const subcatsByCategory = groupBy(subcatsRows, (s) => s.categoryId);

  const categoryOptions: CategoryOption[] = categoryRows.map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    subcategories: subcatsByCategory.get(c.id) ?? [],
  }));

  const accountOptions: AccountOption[] = accountsRows;
  const tagOptions: TagOption[] = tagsRows;

  return (
    <NewTransactionForm
      accounts={accountOptions}
      categories={categoryOptions}
      tags={tagOptions}
    />
  );
}
