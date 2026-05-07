import { z } from "zod";

import {
  moneyString,
  type RecurringFrequency,
  recurringFrequency,
} from "./common.js";
import { lineBaseBody } from "./transactions.js";

export const loanDefaultLineBody = lineBaseBody
  .extend({ amount: moneyString.optional() })
  .strict();
export type LoanDefaultLineBody = z.infer<typeof loanDefaultLineBody>;

export const loanBody = z
  .object({
    amountPerPeriod: moneyString,
    frequency: recurringFrequency,
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
  tags: { id: string; name: string }[];
};

export type Loan = {
  id: string;
  amountPerPeriod: string;
  frequency: RecurringFrequency;
  defaultLines: LoanDefaultLine[];
};
