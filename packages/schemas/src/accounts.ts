import { z } from "zod";

import { dateString, moneyString } from "./common";
import {
  recurringPlanBody,
  type RecurringPlanDefaultLine,
} from "./recurring-plans";
import type { RecurringFrequency } from "./subscriptions";

/**
 * Recurring-plan fields embedded on the loan account row. Two consumers,
 * each using a subset of these fields:
 *
 * - Sidebar payments-remaining indicator: `amountPerPeriod` + `frequency`.
 * - Payment > Loan pre-fill: `amountPerPeriod` (amount), `defaultAccountId`
 *   (source), `defaultLines` (line templates).
 *
 * Bundling avoids an extra round-trip when the user picks a loan in the
 * payment picker. `description` and `firstPaymentDate` aren't surfaced
 * here — they'd come from a dedicated `GET /api/recurring-plans/:id` when
 * a plan editor lands.
 */
export type AccountRecurringPlan = {
  id: string;
  amountPerPeriod: string; // stringified bigint
  frequency: RecurringFrequency;
  defaultAccountId: string | null;
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

// Loan-account update (today): name + group + balance only. Plan terms
// (principal, schedule, lines) edit through a separate plan endpoint
// when that lands; for now they're sticky after creation.
const loanUpdate = baseUpdate
  .extend({
    type: z.literal("loan"),
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
