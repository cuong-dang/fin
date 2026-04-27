import { z } from "zod";

import { dateString, moneyString } from "./common";
import { tagName } from "./tags";

export const recurringFrequency = z.enum([
  "monthly",
  "biweekly",
  "weekly",
  "quarterly",
  "yearly",
]);
export type RecurringFrequency = z.infer<typeof recurringFrequency>;

const currencyField = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase());

// One default line on a subscription. Sum of line amounts = the subscription's
// per-period charge. Mirrors `transactionLineBody` so a charge transaction
// can copy lines verbatim — including the inline-create category/subcategory
// path so users don't have to hop to /settings to set up a new sub.
export const subscriptionDefaultLineBody = z
  .object({
    amount: moneyString,
    categoryId: z.uuid().optional(),
    newCategoryName: z.string().trim().min(1).max(100).optional(),
    subcategoryId: z.uuid().optional(),
    newSubcategoryName: z.string().trim().min(1).max(100).optional(),
    tagNames: z.array(tagName).max(20).optional(),
  })
  .strict();
export type SubscriptionDefaultLineBody = z.infer<
  typeof subscriptionDefaultLineBody
>;

// Both create and update accept the same fields today: update rewrites all
// fields + lines, just like the transaction PATCH. Defined as two distinct
// schemas (rather than aliasing one to the other) so each can evolve
// independently if/when the shapes diverge.
const subscriptionFields = {
  name: z.string().trim().min(1).max(100),
  currency: currencyField,
  frequency: recurringFrequency,
  firstChargeDate: dateString,
  defaultAccountId: z.uuid().optional(),
  description: z.string().trim().min(1).max(500).optional(),
  defaultLines: z.array(subscriptionDefaultLineBody).min(1),
};

export const createSubscriptionBody = z.object(subscriptionFields).strict();
export type CreateSubscriptionBody = z.infer<typeof createSubscriptionBody>;

export const updateSubscriptionBody = z.object(subscriptionFields).strict();
export type UpdateSubscriptionBody = z.infer<typeof updateSubscriptionBody>;

// ─── Response shapes ──────────────────────────────────────────────────────

export type SubscriptionDefaultLine = {
  id: string;
  amount: string; // stringified bigint
  currency: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  description: string | null;
  tags: { id: string; name: string }[];
};

export type Subscription = {
  id: string;
  name: string;
  currency: string;
  frequency: RecurringFrequency;
  firstChargeDate: string;
  defaultAccountId: string | null;
  cancelledAt: string | null; // ISO timestamp; null = active
  description: string | null;
  defaultLines: SubscriptionDefaultLine[];
};
