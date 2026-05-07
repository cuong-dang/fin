import { z } from "zod";

import type { AccountType } from "./accounts.js";
import { categoryResolverInput } from "./categories.js";
import { dateString, moneyString } from "./common.js";
import { tagName } from "./tags.js";

// ─── Create / update (full: income / expense / transfer) ──────────────────

// Shared shape for any "line" body — a category split that may carry tags.
// Bill and loan default-line schemas extend this with an *optional* amount
// (templates may leave amount blank for variable charges); transaction
// lines extend with a *required* amount.
export const lineBaseBody = categoryResolverInput.extend({
  tagNames: z.array(tagName).max(20).optional(),
});
export type LineBaseBody = z.infer<typeof lineBaseBody>;

// One split of an income/expense transaction into a single category. A
// transaction always has at least one line; multi-line means the user split
// the amount across multiple categories. Leg amount = sum of line amounts.
// Each line can carry zero or more tags; tags are upserted by name.
export const transactionLineBody = lineBaseBody
  .extend({ amount: moneyString })
  .strict();
export type TransactionLineBody = z.infer<typeof transactionLineBody>;

const commonFields = z.object({
  date: dateString.optional(), // absent when pending
  pending: z.boolean().default(false),
  description: z.string().trim().min(1).max(500).optional(),
});

const incomeFields = commonFields
  .extend({
    type: z.literal("income"),
    accountId: z.uuid(),
    lines: z.array(transactionLineBody).min(1),
  })
  .strict();

// Expense optionally carries a bill link — bill charges are stored as
// expenses (no balance-reducing leg, no principal); the `billId` just
// marks the source. The "Payment" tab in the form is a UX portal that
// produces this shape with `billId` set when the user picks a bill from
// the grouped picker. Loan/credit-card payments will get their own type
// when they land (hybrid transfer + expense lines).
const expenseFields = commonFields
  .extend({
    type: z.literal("expense"),
    accountId: z.uuid(),
    billId: z.uuid().optional(),
    lines: z.array(transactionLineBody).min(1),
  })
  .strict();

// Transfers may carry optional lines that categorize a portion of the
// payment as non-principal cost (interest, fees) — used for loan payments
// where the lender deducts interest/fees from each payment. The
// destination leg gets `amount − Σ line.amount` (principal portion);
// lines categorize the rest. Pure transfers (checking → checking) leave
// `lines` undefined.
const transferFields = commonFields
  .extend({
    type: z.literal("transfer"),
    amount: moneyString,
    accountId: z.uuid(),
    destinationAccountId: z.uuid(),
    lines: z.array(transactionLineBody).optional(),
  })
  .strict();

export const transactionBody = z.discriminatedUnion("type", [
  incomeFields,
  expenseFields,
  transferFields,
]);
export type TransactionBody = z.infer<typeof transactionBody>;

// ─── Adjustment edit (only date/description/signed amount) ────────────────

export const adjustmentUpdateBody = z
  .object({
    date: dateString,
    amount: moneyString,
    description: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type AdjustmentUpdateBody = z.infer<typeof adjustmentUpdateBody>;

// ─── Mark pending → processed ─────────────────────────────────────────────

export const processTransactionBody = z
  .object({
    // Client must supply the user's local date. Server never fabricates one.
    date: dateString,
  })
  .strict();
export type ProcessTransactionBody = z.infer<typeof processTransactionBody>;

// ─── Reorder (same-day or cross-day) ──────────────────────────────────────

export const reorderTransactionsBody = z
  .object({
    // Target date: movingId ends up on this date.
    date: dateString,
    // The single transaction being dragged. Must appear in `ids`.
    movingId: z.uuid(),
    // Desired newest-first order for a subset of body.date's transactions,
    // including movingId. Non-movingId entries must be transactions already
    // on body.date and appear in their existing relative order — the server
    // assumes "at most one transaction moves per request."
    ids: z.array(z.uuid()).min(1),
  })
  .strict();
export type ReorderTransactionsBody = z.infer<typeof reorderTransactionsBody>;

// ─── Response shapes ──────────────────────────────────────────────────────

export type TxLeg = {
  accountId: string;
  accountName: string;
  accountCurrency: string;
  // Lets the row display tell apart pure transfers from CC / loan
  // payments without a second account lookup.
  accountType: AccountType;
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
  billId: string | null;
  // Joined from `bills` so the row can render "↻ Netflix" without a
  // second client fetch. Resolves even if the bill was soft-deleted, since
  // historical fidelity matters for past payments.
  billName: string | null;
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
