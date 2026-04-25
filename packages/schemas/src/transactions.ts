import { z } from "zod";

import { dateString, moneyString } from "./common";
import { tagName } from "./tags";

// ─── Create / update (full: income / expense / transfer) ──────────────────

// One split of an income/expense transaction into a single category. A
// transaction always has at least one line; multi-line means the user split
// the amount across multiple categories. Leg amount = sum of line amounts.
// Each line can carry zero or more tags; tags are upserted by name.
export const transactionLineBody = z.object({
  amount: moneyString,
  categoryId: z.uuid().optional(),
  newCategoryName: z.string().trim().min(1).max(100).optional(),
  subcategoryId: z.uuid().optional(),
  newSubcategoryName: z.string().trim().min(1).max(100).optional(),
  tagNames: z.array(tagName).max(20).optional(),
});
export type TransactionLineBody = z.infer<typeof transactionLineBody>;

const commonFields = z.object({
  date: dateString.optional(), // absent when pending
  pending: z.boolean().default(false),
  description: z.string().trim().min(1).max(500).optional(),
});

const incomeFields = commonFields.extend({
  type: z.literal("income"),
  accountId: z.uuid(),
  lines: z.array(transactionLineBody).min(1),
});

const expenseFields = commonFields.extend({
  type: z.literal("expense"),
  accountId: z.uuid(),
  lines: z.array(transactionLineBody).min(1),
});

const transferFields = commonFields.extend({
  type: z.literal("transfer"),
  amount: moneyString,
  accountId: z.uuid(),
  destinationAccountId: z.uuid(),
});

export const transactionBody = z.discriminatedUnion("type", [
  incomeFields,
  expenseFields,
  transferFields,
]);
export type TransactionBody = z.infer<typeof transactionBody>;

// ─── Adjustment edit (only date/description/signed amount) ────────────────

export const adjustmentUpdateBody = z.object({
  date: dateString,
  amount: moneyString,
  description: z.string().trim().min(1).max(500).optional(),
});
export type AdjustmentUpdateBody = z.infer<typeof adjustmentUpdateBody>;

// ─── Mark pending → processed ─────────────────────────────────────────────

export const processTransactionBody = z.object({
  // Client must supply the user's local date. Server never fabricates one.
  date: dateString,
});
export type ProcessTransactionBody = z.infer<typeof processTransactionBody>;

// ─── Reorder (same-day or cross-day) ──────────────────────────────────────

export const reorderTransactionsBody = z.object({
  // Target date: movingId ends up on this date.
  date: dateString,
  // The single transaction being dragged. Must appear in `ids`.
  movingId: z.uuid(),
  // Desired newest-first order for a subset of body.date's transactions,
  // including movingId. Non-movingId entries must be transactions already
  // on body.date and appear in their existing relative order — the server
  // assumes "at most one transaction moves per request."
  ids: z.array(z.uuid()).min(1),
});
export type ReorderTransactionsBody = z.infer<typeof reorderTransactionsBody>;

// ─── Response shapes ──────────────────────────────────────────────────────

export type TxLeg = {
  accountId: string;
  accountName: string;
  accountCurrency: string;
  amount: string; // stringified bigint (JSON can't carry bigint natively)
};

export type TxLine = {
  amount: string;
  currency: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  tags: { id: string; name: string }[];
};

export type EnrichedTransaction = {
  id: string;
  date: string | null; // null = pending
  createdAt: string; // ISO
  type: "income" | "expense" | "transfer" | "adjustment";
  description: string | null;
  legs: TxLeg[];
  lines: TxLine[];
  // Present only when the list is filtered by accountId and this is a
  // completed row: account balance immediately after this transaction
  // posts. Stringified bigint in the account's minor units.
  balanceAfter?: string;
};

export type TransactionsListResponse = {
  pending: EnrichedTransaction[];
  completed: EnrichedTransaction[];
};
