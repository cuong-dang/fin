import { schema } from "../db";
import type { TransactionBody, TransactionLineBody } from "@fin/schemas";
import { db } from "../db";
import { findOwned } from "./authz";
import { parseMoney } from "./money";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Insert legs + lines for a transaction. Caller is responsible for having
 * already created (or wiped + re-created) the `transactions` row with the
 * given id. Income/expense supports multi-line splits: leg amount is the
 * sum of line amounts; each line resolves/creates its own category and
 * subcategory inline. Transfers validate destination + currency match.
 */
export async function insertLegsAndLines(
  tx: Tx,
  transactionId: string,
  parsed: TransactionBody,
  sourceAccount: { currency: string },
  workspaceGroupId: string,
): Promise<void> {
  if (parsed.type === "income" || parsed.type === "expense") {
    if (parsed.lines.length === 0) {
      throw new Error("At least one line is required");
    }

    // Parse + validate every line's amount up front so nothing is written
    // if any line is bad.
    const lineMinors = parsed.lines.map((l) =>
      parseMoney(l.amount, sourceAccount.currency),
    );
    if (lineMinors.some((m) => m <= 0n)) {
      throw new Error("Each line amount must be positive");
    }
    const totalMinor = lineMinors.reduce((s, m) => s + m, 0n);

    const sign = parsed.type === "income" ? 1n : -1n;
    await tx.insert(schema.transactionLegs).values({
      transactionId,
      accountId: parsed.accountId,
      amount: sign * totalMinor,
    });

    for (let i = 0; i < parsed.lines.length; i++) {
      const line = parsed.lines[i];
      const { categoryId, subcategoryId } = await resolveCategoryForLine(
        tx,
        line,
        parsed.type,
        workspaceGroupId,
      );
      await tx.insert(schema.transactionLines).values({
        transactionId,
        categoryId,
        subcategoryId,
        tagId: parsed.tagId ?? null,
        amount: lineMinors[i],
        currency: sourceAccount.currency,
      });
    }
    return;
  }

  // transfer
  const amountMinor = parseMoney(parsed.amount, sourceAccount.currency);
  if (amountMinor <= 0n) throw new Error("Amount must be positive");
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

async function resolveCategoryForLine(
  tx: Tx,
  line: TransactionLineBody,
  kind: "income" | "expense",
  workspaceGroupId: string,
): Promise<{ categoryId: string; subcategoryId: string | null }> {
  let categoryId = line.categoryId;
  if (line.newCategoryName) {
    const [row] = await tx
      .insert(schema.categories)
      .values({ groupId: workspaceGroupId, kind, name: line.newCategoryName })
      .returning({ id: schema.categories.id });
    categoryId = row.id;
  }
  if (!categoryId) {
    throw new Error("Category is required (pick one or name a new one)");
  }

  let subcategoryId: string | null = line.subcategoryId ?? null;
  if (line.newSubcategoryName) {
    const [row] = await tx
      .insert(schema.subcategories)
      .values({ categoryId, name: line.newSubcategoryName })
      .returning({ id: schema.subcategories.id });
    subcategoryId = row.id;
  }

  return { categoryId, subcategoryId };
}
