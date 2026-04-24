import { z } from "zod";
import { dateString, moneyString } from "./common";

const nameField = z.string().trim().min(1).max(100);
const currencyField = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase());
const newGroupField = z.string().trim().min(1).max(100).optional();

/**
 * Create request. Exactly one of accountGroupId or newGroupName must be
 * present. Validated in the route (Zod + in-action check).
 */
export const createAccountBody = z.object({
  name: nameField,
  currency: currencyField,
  accountGroupId: z.uuid().optional(),
  newGroupName: newGroupField,
  startingBalance: moneyString.optional(),
  adjustmentDate: dateString.optional(),
});
export type CreateAccountBody = z.infer<typeof createAccountBody>;

export const updateAccountBody = z.object({
  name: nameField,
  accountGroupId: z.uuid().optional(),
  newGroupName: newGroupField,
  newBalance: moneyString.optional(),
  adjustmentDate: dateString.optional(),
});
export type UpdateAccountBody = z.infer<typeof updateAccountBody>;

export type Account = {
  id: string;
  accountGroupId: string;
  name: string;
  currency: string;
  /** Settled legs only. */
  presentBalance: string;
  /** All legs, including pending. */
  availableBalance: string;
};
