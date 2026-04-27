import type { TransactionBody } from "@fin/schemas";

import { schema } from "../db";
import { db } from "../db";
import { findOwned } from "./authz";
import { resolveCategory } from "./categories-resolve";
import { parseMoney } from "./money";
import { upsertTags } from "./tags-upsert";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type SourceAccount = { currency: string; type: string };

/**
 * Insert legs + lines for a transaction. Caller is responsible for having
 * already created (or wiped + re-created) the `transactions` row with the
 * given id. Income/expense supports multi-line splits: leg amount is the
 * sum of line amounts; each line resolves/creates its own category and
 * subcategory inline and links any provided tags via the junction.
 *
 * Transfers:
 *   - Source: any non-loan account (checking/savings or credit_card).
 *     "From a loan" doesn't make sense.
 *   - Destination: any account type (checking/savings, credit_card, loan).
 *     Loan destination is how loan payments land; CC destination is how
 *     CC payments land. The Transfer tab filters both sides to checking/
 *     savings — those flows surface through Payment > Loan / Credit card.
 *   - Optional `lines` (loan payments only): categorize the non-principal
 *     portion (interest, fees). Destination leg = `amount − Σ line.amount`
 *     (principal portion); source leg = `−amount` (full cash out). For
 *     pure transfers (no lines) the legs sum to 0.
 */
export async function insertLegsAndLines(
  tx: Tx,
  transactionId: string,
  parsed: TransactionBody,
  sourceAccount: SourceAccount,
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
      const { categoryId, subcategoryId } = await resolveCategory(
        tx,
        line,
        parsed.type,
        workspaceGroupId,
      );
      const [lineRow] = await tx
        .insert(schema.transactionLines)
        .values({
          transactionId,
          categoryId,
          subcategoryId,
          amount: lineMinors[i],
          currency: sourceAccount.currency,
        })
        .returning({ id: schema.transactionLines.id });
      await linkTagsToLine(tx, lineRow.id, line.tagNames, workspaceGroupId);
    }
    return;
  }

  // transfer
  const amountMinor = parseMoney(parsed.amount, sourceAccount.currency);
  if (amountMinor <= 0n) throw new Error("Amount must be positive");
  if (parsed.accountId === parsed.destinationAccountId) {
    throw new Error("Source and destination accounts must differ");
  }
  if (sourceAccount.type === "loan") {
    throw new Error("Source account cannot be a loan");
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

  // Optional lines: only meaningful when the destination is a loan
  // (lender deducts interest/fees from each payment). Lines categorize
  // the non-principal portion; destination leg gets the principal.
  const lines = parsed.lines ?? [];
  if (lines.length > 0 && destAccount.type !== "loan") {
    throw new Error("Lines on a transfer are only allowed for loan payments");
  }
  const lineMinors = lines.map((l) =>
    parseMoney(l.amount, sourceAccount.currency),
  );
  if (lineMinors.some((m) => m <= 0n)) {
    throw new Error("Each line amount must be positive");
  }
  const linesSum = lineMinors.reduce((s, m) => s + m, 0n);
  if (linesSum > amountMinor) {
    throw new Error("Sum of lines cannot exceed payment amount");
  }
  const principalPortion = amountMinor - linesSum;

  await tx.insert(schema.transactionLegs).values([
    { transactionId, accountId: parsed.accountId, amount: -amountMinor },
    {
      transactionId,
      accountId: parsed.destinationAccountId,
      amount: principalPortion,
    },
  ]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { categoryId, subcategoryId } = await resolveCategory(
      tx,
      line,
      "expense",
      workspaceGroupId,
    );
    const [lineRow] = await tx
      .insert(schema.transactionLines)
      .values({
        transactionId,
        categoryId,
        subcategoryId,
        amount: lineMinors[i],
        currency: sourceAccount.currency,
      })
      .returning({ id: schema.transactionLines.id });
    await linkTagsToLine(tx, lineRow.id, line.tagNames, workspaceGroupId);
  }
}

/**
 * Upsert each tag name for the workspace and link it to the line via the
 * `transaction_line_tags` junction. Tag names are deduped (Zod trims).
 */
async function linkTagsToLine(
  tx: Tx,
  lineId: string,
  tagNames: string[] | undefined,
  workspaceGroupId: string,
): Promise<void> {
  if (!tagNames || tagNames.length === 0) return;
  const byName = await upsertTags(tx, tagNames, workspaceGroupId);
  const unique = [...new Set(tagNames)];
  await tx.insert(schema.transactionLineTags).values(
    unique.map((name) => {
      const tagId = byName.get(name);
      if (!tagId) throw new Error(`Invariant: tag "${name}" not resolved`);
      return { lineId, tagId };
    }),
  );
}
