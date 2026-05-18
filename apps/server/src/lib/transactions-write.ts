import type { TransactionBody } from "@fin/schemas";

import type { Tx } from "../db/index.js";
import { schema } from "../db/index.js";
import { findOwnedParent } from "./authz.js";
import { resolveCategory } from "./categories-resolve.js";
import { parseMoney } from "./money.js";
import { upsertTags } from "./tags-upsert.js";

type SourceAccount = { currency: string; type: string };

/**
 * Insert legs + lines for a transaction. Caller is responsible for having
 * already created (or wiped + re-created) the `transactions` row with the
 * given id. Income/expense supports multi-line splits: leg amount is the
 * sum of line amounts; each line resolves/creates its own category and
 * subcategory inline and links any provided tags via the junction.
 *
 * Transfer rules enforced here (UI gating is separate):
 *   - Source must not be a loan account.
 *   - Source and destination must share a currency (no FX yet).
 *   - Optional `lines` are only valid when the destination is a loan —
 *     they categorize the non-principal portion of the payment (interest,
 *     fees). Source leg is `−amount`; destination leg is `amount − Σ lines`
 *     (the principal portion that reduces the loan balance).
 */
export async function insertLegsAndLines(
  tx: Tx,
  transactionId: string,
  parsed: TransactionBody,
  sourceAccount: SourceAccount,
  workspaceId: string,
): Promise<void> {
  if (
    parsed.type === "income" ||
    parsed.type === "expense" ||
    parsed.type === "refund"
  ) {
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

    // Refund shape mirrors income: positive leg (money inbound to the
    // receiving account), positive lines. Analytics handle the sign
    // semantics via CASE on `tx.type` rather than storing negatives.
    const sign = parsed.type === "expense" ? -1n : 1n;
    // For refund + expense, lines reference EXPENSE-kind categories
    // (refunds reverse expenses, so they hit the same buckets).
    const categoryKind = parsed.type === "income" ? "income" : "expense";

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
        categoryKind,
        workspaceId,
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
      await linkTagsToLine(tx, lineRow.id, line.tagNames, workspaceId);
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
  const destAccount = await findOwnedParent(
    schema.accounts,
    schema.accountGroups,
    schema.accounts.accountGroupId,
    schema.accountGroups.id,
    parsed.destinationAccountId,
    workspaceId,
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
      workspaceId,
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
    await linkTagsToLine(tx, lineRow.id, line.tagNames, workspaceId);
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
  workspaceId: string,
): Promise<void> {
  if (!tagNames || tagNames.length === 0) return;
  const byName = await upsertTags(tx, tagNames, workspaceId);
  const unique = [...new Set(tagNames)];
  await tx.insert(schema.transactionLineTags).values(
    unique.map((name) => {
      const tagId = byName.get(name);
      if (!tagId) throw new Error(`Invariant: tag "${name}" not resolved`);
      return { lineId, tagId };
    }),
  );
}
