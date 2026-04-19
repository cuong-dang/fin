import { schema } from "../db";
import type { TransactionBody } from "@fin/schemas";
import { db } from "../db";
import { findOwned } from "./authz";
import { parseMoney } from "./money";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Insert legs + lines for a transaction. Caller is responsible for having
 * already created (or wiped + re-created) the `transactions` row with the
 * given id. For income/expense resolves/creates category + subcategory
 * inline. For transfers validates destination + currency match.
 */
export async function insertLegsAndLines(
  tx: Tx,
  transactionId: string,
  parsed: TransactionBody,
  sourceAccount: { currency: string },
  workspaceGroupId: string,
): Promise<void> {
  const amountMinor = parseMoney(parsed.amount, sourceAccount.currency);
  if (amountMinor <= 0n) throw new Error("Amount must be positive");

  if (parsed.type === "income" || parsed.type === "expense") {
    let categoryId = parsed.categoryId;
    if (parsed.newCategoryName) {
      const [row] = await tx
        .insert(schema.categories)
        .values({
          groupId: workspaceGroupId,
          kind: parsed.type,
          name: parsed.newCategoryName,
        })
        .returning({ id: schema.categories.id });
      categoryId = row.id;
    }
    if (!categoryId) {
      throw new Error("Category is required (pick one or name a new one)");
    }

    let subcategoryId = parsed.subcategoryId ?? null;
    if (parsed.newSubcategoryName) {
      const [row] = await tx
        .insert(schema.subcategories)
        .values({ categoryId, name: parsed.newSubcategoryName })
        .returning({ id: schema.subcategories.id });
      subcategoryId = row.id;
    }

    const sign = parsed.type === "income" ? 1n : -1n;
    await tx.insert(schema.transactionLegs).values({
      transactionId,
      accountId: parsed.accountId,
      amount: sign * amountMinor,
    });
    await tx.insert(schema.transactionLines).values({
      transactionId,
      categoryId,
      subcategoryId,
      tagId: parsed.tagId ?? null,
      amount: amountMinor,
      currency: sourceAccount.currency,
    });
    return;
  }

  // transfer
  if (parsed.accountId === parsed.destinationAccountId) {
    throw new Error("Source and destination accounts must differ");
  }
  const destAccount = await findOwned(
    schema.accounts,
    parsed.destinationAccountId,
    workspaceGroupId,
  );
  if (!destAccount) throw new Error("Destination account not found");
  if (destAccount.currency !== sourceAccount.currency) {
    throw new Error(
      "FX transfers not yet supported — accounts must share a currency",
    );
  }
  await tx.insert(schema.transactionLegs).values([
    { transactionId, accountId: parsed.accountId, amount: -amountMinor },
    {
      transactionId,
      accountId: parsed.destinationAccountId,
      amount: amountMinor,
    },
  ]);
  // Plain transfer: no lines.
}
