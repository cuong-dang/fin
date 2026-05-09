import { z } from "zod";

import { currencyField, dateString, moneyString } from "./common.js";
import type { Loan } from "./loans.js";
import { loanBody } from "./loans.js";

const nameField = z.string().trim().min(1).max(100);
const newAccountGroupField = z.string().trim().min(1).max(100).optional();

export const accountType = z.enum(["checking_savings", "credit_card", "loan"]);
export type AccountType = z.infer<typeof accountType>;

// Fields shared by every account-create variant. New account types (e.g.,
// loan) extend this and add their own `type` literal plus type-specific
// fields. The discriminated union below picks variants by `type`.
const baseCreate = z.object({
  name: nameField,
  currency: currencyField,
  accountGroupId: z.uuid().optional(),
  newAccountGroupName: newAccountGroupField,
  startingBalance: moneyString.optional(),
  adjustmentDate: dateString.optional(),
  excludeFromNetWorth: z.boolean(),
});

const checkingSavingsCreate = baseCreate
  .extend({
    type: z.literal("checking_savings"),
  })
  .strict();

// `creditLimit` is required (drives the sidebar progress bar).
const creditCardCreate = baseCreate
  .extend({
    type: z.literal("credit_card"),
    creditLimit: moneyString,
    defaultPayFromAccountId: z.uuid().optional(),
  })
  .strict();

const loanCreate = baseCreate
  .extend({
    type: z.literal("loan"),
    defaultPayFromAccountId: z.uuid().optional(),
    loan: loanBody,
  })
  .strict();

export const createAccountBody = z.discriminatedUnion("type", [
  checkingSavingsCreate,
  creditCardCreate,
  loanCreate,
]);
export type CreateAccountBody = z.infer<typeof createAccountBody>;

// Currency is fixed at creation, so it doesn't appear here.
const baseUpdate = z.object({
  name: nameField,
  accountGroupId: z.uuid().optional(),
  newGroupName: newAccountGroupField,
  newBalance: moneyString.optional(),
  adjustmentDate: dateString.optional(),
  excludeFromNetWorth: z.boolean().optional(),
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
// account fields (mirrors bill update — full replacement, not a
// patch).
const loanUpdate = baseUpdate
  .extend({
    type: z.literal("loan"),
    defaultPayFromAccountId: z.uuid().optional(),
    loan: loanBody,
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
  presentBalance: string;
  availableBalance: string;
  creditLimit: string | null;
  defaultPayFromAccountId: string | null;
  loan: Loan | null;
  archivedAt: string | null;
  excludeFromNetWorth: boolean;
};
