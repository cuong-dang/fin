import { z } from "zod";

import { dateString, moneyString } from "./common";
import {
  recurringPlanBody,
  type RecurringPlanDefaultLine,
} from "./recurring-plans";
import type { RecurringFrequency } from "./subscriptions";

/**
 * Full recurring-plan payload embedded on the loan account row. Bundled
 * with the account so the sidebar (payments-remaining), the Payment > Loan
 * pre-fill, and the Edit form can all read what they need without a
 * second round-trip. The plan has no `name` of its own — the paired
 * account's `name` covers display.
 */
export type AccountRecurringPlan = {
  id: string;
  amountPerPeriod: string; // stringified bigint
  frequency: RecurringFrequency;
  firstPaymentDate: string;
  defaultAccountId: string | null;
  description: string | null;
  defaultLines: RecurringPlanDefaultLine[];
};

const nameField = z.string().trim().min(1).max(100);
const currencyField = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase());
const newGroupField = z.string().trim().min(1).max(100).optional();

// Loan accounts pair 1:1 with a `recurring_plans` row holding the schedule.
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

const checkingSavingsCreate = baseCreate
  .extend({
    type: z.literal("checking_savings").default("checking_savings"),
  })
  .strict();

// `creditLimit` is required (drives the sidebar progress bar).
// `defaultPayFromAccountId` is optional and validated server-side to point
// at a checking_savings account.
const creditCardCreate = baseCreate
  .extend({
    type: z.literal("credit_card"),
    creditLimit: moneyString,
    defaultPayFromAccountId: z.uuid().optional(),
  })
  .strict();

// Loan create embeds the recurring-plan params; server creates the plan
// row and the account row atomically and links them via
// accounts.recurring_plan_id.
const loanCreate = baseCreate
  .extend({
    type: z.literal("loan"),
    recurringPlan: recurringPlanBody,
  })
  .strict();

/**
 * Create request. Exactly one of accountGroupId or newGroupName must be
 * present. Validated in the route (Zod + in-action check).
 */
export const createAccountBody = z.discriminatedUnion("type", [
  checkingSavingsCreate,
  creditCardCreate,
  loanCreate,
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

const checkingSavingsUpdate = baseUpdate
  .extend({
    type: z.literal("checking_savings"),
  })
  .strict();

const creditCardUpdate = baseUpdate
  .extend({
    type: z.literal("credit_card"),
    creditLimit: moneyString,
    defaultPayFromAccountId: z.uuid().optional(),
  })
  .strict();

// Loan-account update: rewrites the paired recurring_plan along with the
// account fields (mirrors subscription update — full replacement, not a
// patch). Currency and type stay sticky.
const loanUpdate = baseUpdate
  .extend({
    type: z.literal("loan"),
    recurringPlan: recurringPlanBody,
  })
  .strict();

export const updateAccountBody = z.discriminatedUnion("type", [
  checkingSavingsUpdate,
  creditCardUpdate,
  loanUpdate,
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
  /** Set only when type='loan'. Joined plan summary; null otherwise. */
  recurringPlan: AccountRecurringPlan | null;
};
