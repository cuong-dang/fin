import { z } from "zod";

import { currencyField, moneyString } from "./common.js";
import { tagName } from "./tags.js";

export const recurringFrequency = z.enum([
  "monthly",
  "biweekly",
  "weekly",
  "quarterly",
  "yearly",
]);
export type RecurringFrequency = z.infer<typeof recurringFrequency>;

// Three flavors of recurring bill, distinguished mostly by UX hints (the
// underlying mechanism — periodic charge with a default categorization
// template — is identical):
//   - utility:      variable-amount essential service (electric, water).
//                   Rarely cancelled; amount typically blank in the
//                   template since it changes per period.
//   - subscription: fixed-amount discretionary service (Netflix). Pause /
//                   cancel is a common operation.
//   - other:        catch-all for taxes, fees, dues, etc.
export const billType = z.enum(["utility", "subscription", "other"]);
export type BillType = z.infer<typeof billType>;

// One default line on a bill. Sum of line amounts (when set) = the bill's
// per-period charge. Mirrors `transactionLineBody` so a charge transaction
// can copy lines verbatim — including the inline-create
// category/subcategory path so users don't have to hop to /settings to
// set up a new bill. `amount` is optional: utilities (and some bills with
// variable totals) leave amount blank in the template.
export const billDefaultLineBody = z
  .object({
    amount: moneyString.optional(),
    categoryId: z.uuid().optional(),
    newCategoryName: z.string().trim().min(1).max(100).optional(),
    subcategoryId: z.uuid().optional(),
    newSubcategoryName: z.string().trim().min(1).max(100).optional(),
    tagNames: z.array(tagName).max(20).optional(),
  })
  .strict();
export type BillDefaultLineBody = z.infer<typeof billDefaultLineBody>;

// Both create and update accept the same fields today: update rewrites all
// fields + lines, just like the transaction PATCH. Defined as two distinct
// schemas (rather than aliasing one to the other) so each can evolve
// independently if/when the shapes diverge.
const billFields = {
  name: z.string().trim().min(1).max(100),
  type: billType,
  currency: currencyField,
  frequency: recurringFrequency,
  defaultAccountId: z.uuid().optional(),
  description: z.string().trim().min(1).max(500).optional(),
  defaultLines: z.array(billDefaultLineBody).min(1),
};

export const createBillBody = z.object(billFields).strict();
export type CreateBillBody = z.infer<typeof createBillBody>;

export const updateBillBody = z.object(billFields).strict();
export type UpdateBillBody = z.infer<typeof updateBillBody>;

// ─── Response shapes ──────────────────────────────────────────────────────

export type BillDefaultLine = {
  id: string;
  amount: string | null; // stringified bigint; null = varies per period
  currency: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  description: string | null;
  tags: { id: string; name: string }[];
};

export type Bill = {
  id: string;
  name: string;
  type: BillType;
  currency: string;
  frequency: RecurringFrequency;
  defaultAccountId: string | null;
  cancelledAt: string | null; // ISO timestamp; null = active
  description: string | null;
  defaultLines: BillDefaultLine[];
};
