import { z } from "zod";

import { dateString, moneyString } from "./common";

const nameField = z.string().trim().min(1).max(100);
const currencyField = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase());
const newGroupField = z.string().trim().min(1).max(100).optional();

// `loan` is reserved — only `checking_savings` and `credit_card` are wired
// today. Loan accounts will pair 1:1 with a recurring_plan when added.
export const accountType = z.enum(["checking_savings", "credit_card", "loan"]);
export type AccountType = z.infer<typeof accountType>;

// Fields shared by every account-create variant. New account types (e.g.,
// loan) extend this and add their own `type` literal plus type-specific
// fields. The discriminated union below picks variants by `type`.
const baseCreate = z.object({
  name: nameField,
  currency: currencyField,
  accountGroupId: z.uuid().optional(),
  newGroupName: newGroupField,
  startingBalance: moneyString.optional(),
  adjustmentDate: dateString.optional(),
});

const checkingSavingsCreate = baseCreate.extend({
  type: z.literal("checking_savings").default("checking_savings"),
});

// `creditLimit` is required (drives the sidebar progress bar).
// `defaultPayFromAccountId` is optional and validated server-side to point
// at a checking_savings account.
const creditCardCreate = baseCreate.extend({
  type: z.literal("credit_card"),
  creditLimit: moneyString,
  defaultPayFromAccountId: z.uuid().optional(),
});

/**
 * Create request. Exactly one of accountGroupId or newGroupName must be
 * present. Validated in the route (Zod + in-action check).
 */
export const createAccountBody = z.discriminatedUnion("type", [
  checkingSavingsCreate,
  creditCardCreate,
]);
export type CreateAccountBody = z.infer<typeof createAccountBody>;

// Fields shared by every account-update variant. Currency is fixed at
// creation, so it doesn't appear here. `newBalance` covers user-driven
// reconciliations and is recorded as an adjustment leg server-side.
const baseUpdate = z.object({
  name: nameField,
  accountGroupId: z.uuid().optional(),
  newGroupName: newGroupField,
  newBalance: moneyString.optional(),
  adjustmentDate: dateString.optional(),
});

const checkingSavingsUpdate = baseUpdate.extend({
  type: z.literal("checking_savings"),
});

const creditCardUpdate = baseUpdate.extend({
  type: z.literal("credit_card"),
  creditLimit: moneyString,
  defaultPayFromAccountId: z.uuid().optional(),
});

export const updateAccountBody = z.discriminatedUnion("type", [
  checkingSavingsUpdate,
  creditCardUpdate,
]);
export type UpdateAccountBody = z.infer<typeof updateAccountBody>;

export type Account = {
  id: string;
  accountGroupId: string;
  name: string;
  currency: string;
  type: AccountType;
  /** Settled legs only. */
  presentBalance: string;
  /** All legs, including pending. */
  availableBalance: string;
  /** Set only when type='credit_card'. Stringified bigint, currency minor units. */
  creditLimit: string | null;
  /** Set only when type='credit_card'. Optional. */
  defaultPayFromAccountId: string | null;
};
