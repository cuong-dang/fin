import { z } from "zod";

import { type RecurringFrequency, recurringFrequency } from "./bills.js";
import { moneyString } from "./common.js";
import { tagName } from "./tags.js";

// One default categorization line on a recurring plan. Mirrors
// `billDefaultLineBody` except `amount` is *optional* — for
// amortizing loans the principal/interest split changes per period, so
// the template records categorization but leaves amounts to be entered
// at transaction time. Set the amount only when it's actually fixed
// (e.g., flat BNPL).
export const recurringPlanDefaultLineBody = z
  .object({
    amount: moneyString.optional(),
    categoryId: z.uuid().optional(),
    newCategoryName: z.string().trim().min(1).max(100).optional(),
    subcategoryId: z.uuid().optional(),
    newSubcategoryName: z.string().trim().min(1).max(100).optional(),
    tagNames: z.array(tagName).max(20).optional(),
  })
  .strict();
export type RecurringPlanDefaultLineBody = z.infer<
  typeof recurringPlanDefaultLineBody
>;

// Input shape for a recurring plan, embedded in the loan-account-create
// body. Server creates the plan row + the loan account row atomically
// and links them via accounts.recurring_plan_id. The plan has no name
// of its own — displays reuse the account's name.
export const recurringPlanBody = z
  .object({
    amountPerPeriod: moneyString,
    frequency: recurringFrequency,
    // Optional default pay-from. Validated server-side as checking_savings.
    defaultAccountId: z.uuid().optional(),
    description: z.string().trim().min(1).max(500).optional(),
    defaultLines: z.array(recurringPlanDefaultLineBody),
  })
  .strict();
export type RecurringPlanBody = z.infer<typeof recurringPlanBody>;

// ─── Response shape ────────────────────────────────────────────────────────

export type RecurringPlanDefaultLine = {
  id: string;
  amount: string | null;
  currency: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  description: string | null;
  tags: { id: string; name: string }[];
};

export type RecurringPlan = {
  id: string;
  amountPerPeriod: string; // stringified bigint
  currency: string;
  frequency: RecurringFrequency;
  defaultAccountId: string | null;
  description: string | null;
  defaultLines: RecurringPlanDefaultLine[];
};
