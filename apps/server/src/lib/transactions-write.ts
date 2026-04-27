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
 * Transfers validate destination + currency match. Source must be a
 * checking/savings account; destination may be checking/savings or a
 * credit_card (the latter is how CC payments are recorded — surfaced via
 * the Payment tab in the UI; the Transfer tab itself filters CC out).
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
  if (sourceAccount.type !== "checking_savings") {
    throw new Error("Source account must be a checking/savings account");
  }
  const destAccount = await findOwned(
    schema.accounts,
    parsed.destinationAccountId,
    workspaceGroupId,
  );
  if (!destAccount) throw new Error("Destination account not found");
  if (
    destAccount.type !== "checking_savings" &&
    destAccount.type !== "credit_card"
  ) {
    throw new Error(
      "Destination must be a checking/savings or credit-card account",
    );
  }
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
  // Plain transfer: no lines, no tags.
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
