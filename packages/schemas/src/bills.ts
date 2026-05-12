import { z } from "zod";

import {
  currencyField,
  moneyString,
  optionalUuid,
  type RecurringFrequency,
  recurringFrequency,
} from "./common.js";
import { lineBaseBody } from "./transactions.js";

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

export const billDefaultLineBody = lineBaseBody
  .extend({ amount: z.union([moneyString, z.literal("")]) })
  .strict();
export type BillDefaultLineBody = z.infer<typeof billDefaultLineBody>;

const billFields = {
  name: z.string().trim().min(1).max(100),
  type: billType,
  currency: currencyField,
  frequency: recurringFrequency,
  defaultPayFromAccountId: optionalUuid,
  defaultLines: z.array(billDefaultLineBody).min(1),
};

export const createBillBody = z.object(billFields).strict();
export type CreateBillBody = z.infer<typeof createBillBody>;

export const updateBillBody = z.object(billFields).strict();
export type UpdateBillBody = z.infer<typeof updateBillBody>;

// ─── Response shapes ──────────────────────────────────────────────────────

export type BillDefaultLine = {
  id: string;
  amount: string | null;
  currency: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  tags: { id: string; name: string }[];
};

export type Bill = {
  id: string;
  name: string;
  type: BillType;
  currency: string;
  frequency: RecurringFrequency;
  defaultPayFromAccountId: string | null;
  cancelledAt: string | null;
  defaultLines: BillDefaultLine[];
};
