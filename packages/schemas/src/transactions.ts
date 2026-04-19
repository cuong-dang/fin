import { z } from "zod";
import { dateString, moneyString } from "./common";

// ─── Create / update (full: income / expense / transfer) ──────────────────

const baseFields = z.object({
  date: dateString.optional(), // absent when pending
  pending: z.boolean().default(false),
  amount: moneyString,
  description: z.string().trim().min(1).max(500).optional(),
  tagId: z.uuid().optional(),
});

const incomeFields = baseFields.extend({
  type: z.literal("income"),
  accountId: z.uuid(),
  categoryId: z.uuid().optional(),
  newCategoryName: z.string().trim().min(1).max(100).optional(),
  subcategoryId: z.uuid().optional(),
  newSubcategoryName: z.string().trim().min(1).max(100).optional(),
});

const expenseFields = baseFields.extend({
  type: z.literal("expense"),
  accountId: z.uuid(),
  categoryId: z.uuid().optional(),
  newCategoryName: z.string().trim().min(1).max(100).optional(),
  subcategoryId: z.uuid().optional(),
  newSubcategoryName: z.string().trim().min(1).max(100).optional(),
});

const transferFields = baseFields.extend({
  type: z.literal("transfer"),
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
  date: dateString.optional(),
});
export type ProcessTransactionBody = z.infer<typeof processTransactionBody>;

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
  tagId: string | null;
  tagName: string | null;
};

export type EnrichedTransaction = {
  id: string;
  date: string | null; // null = pending
  createdAt: string; // ISO
  type: "income" | "expense" | "transfer" | "adjustment";
  description: string | null;
  legs: TxLeg[];
  lines: TxLine[];
};

export type TransactionsListResponse = {
  pending: EnrichedTransaction[];
  completed: EnrichedTransaction[];
};
