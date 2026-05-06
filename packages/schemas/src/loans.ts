import { z } from "zod";

import { moneyString, type RecurringFrequency, recurringFrequency } from "./common.js";
import { tagName } from "./tags.js";

export const loanDefaultLineBody = z
  .object({
    categoryId: z.uuid().optional(),
    newCategoryName: z.string().trim().min(1).max(100).optional(),
    subcategoryId: z.uuid().optional(),
    newSubcategoryName: z.string().trim().min(1).max(100).optional(),
    amount: moneyString.optional(),
    tagNames: z.array(tagName).max(20).optional(),
  })
  .strict();
export type LoanDefaultLineBody = z.infer<typeof loanDefaultLineBody>;

export const loanBody = z
  .object({
    amountPerPeriod: moneyString,
    frequency: recurringFrequency,
    defaultPayFromAccountId: z.uuid().optional(),
    defaultLines: z.array(loanDefaultLineBody),
  })
  .strict();
export type LoanBody = z.infer<typeof loanBody>;

// ─── Response shape ────────────────────────────────────────────────────────

export type LoanDefaultLine = {
  id: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  amount: string | null;
  currency: string;
  tags: { id: string; name: string }[];
};

export type Loan = {
  id: string;
  amountPerPeriod: string; // stringified bigint
  currency: string;
  frequency: RecurringFrequency;
  defaultPayFromAccountId: string | null;
  defaultLines: LoanDefaultLine[];
};
