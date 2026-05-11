import { z } from "zod";

import {
  moneyString,
  type RecurringFrequency,
  recurringFrequency,
} from "./common.js";
import { lineBaseBody } from "./transactions.js";

// Loan default lines share `TransactionLineBody`'s wire shape — clients
// always send a string `amount`, with `""` meaning "no amount" (variable
// per-period charges). The write path translates `""` → null when
// inserting into the DB. Transactions still validate `amount` as a
// positive moneyString; only loan/bill default lines accept the empty
// case.
export const loanDefaultLineBody = lineBaseBody
  .extend({ amount: z.union([moneyString, z.literal("")]) })
  .strict();

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
