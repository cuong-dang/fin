import type { EnrichedTransaction, TxLeg, TxLine } from "@fin/schemas";

/**
 * One-line headline for a transaction — what reads as the title in the
 * list, the row that opens the edit page, the refund form's "Refunding
 * X" header, etc. Centralized so all surfaces agree on naming.
 *
 * Resolution order:
 *   1. User-supplied description.
 *   2. Transfer: "{destination} payment" when paying a CC / loan,
 *      else "Transfer".
 *   3. Multi-line expense/income: "N categories".
 *   4. Single-line: that line's "Category / Subcategory".
 *   5. Adjustment: "Balance adjustment".
 *   6. Fallback to "" — callers may substitute their own "Untitled"-
 *      style label if they need a non-empty string.
 */
export function primaryLabel(tx: EnrichedTransaction): string {
  if (tx.description) return tx.description;
  if (tx.type === "transfer") {
    const inLeg = tx.legs.find((l) => BigInt(l.amount) > 0n);
    if (inLeg && isDebtPayment(inLeg)) return `${inLeg.accountName} payment`;
    return "Transfer";
  }
  if (tx.lines.length > 1) return `${tx.lines.length} categories`;
  if (tx.lines[0]) return categoryLabel(tx.lines[0]);
  if (tx.type === "adjustment") return "Balance adjustment";
  return "";
}

/** "Category" or "Category / Subcategory". */
export function categoryLabel(line: TxLine): string {
  return line.subcategoryName
    ? `${line.categoryName} / ${line.subcategoryName}`
    : line.categoryName;
}

/**
 * A transfer whose destination is a debt account is a settlement
 * payment (paying down a CC or a loan), not a plain account-to-account
 * transfer.
 */
export function isDebtPayment(inLeg: TxLeg): boolean {
  return inLeg.accountType === "credit_card" || inLeg.accountType === "loan";
}
