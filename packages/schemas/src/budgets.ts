import { z } from "zod";

import { currencyField, moneyString, optionalUuid } from "./common.js";

/**
 * Budgets reuse most of the global recurring frequencies, but skip
 * biweekly — it has no natural calendar anchor and the spec doesn't
 * call for one. The DB column reuses the shared `recurring_frequency`
 * enum (bills + loans need biweekly); this narrower enum just clamps
 * what the budgets endpoint accepts on the wire.
 */
export const budgetFrequency = z.enum([
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);
export type BudgetFrequency = z.infer<typeof budgetFrequency>;

/**
 * Budget create — pins to either a category OR a subcategory, never
 * both. `currency`, target, and frequency are immutable post-create:
 * to change any of them, delete and create a new budget (mirrors the
 * account-currency rule). Only `amount` is patchable later. The
 * server enforces exactly-one-target with a DB CHECK constraint;
 * we also reject the wrong shape at the API boundary here.
 */
export const createBudgetBody = z
  .object({
    categoryId: optionalUuid,
    subcategoryId: optionalUuid,
    amount: moneyString,
    currency: currencyField,
    frequency: budgetFrequency,
  })
  .strict()
  .refine((v) => Boolean(v.categoryId) !== Boolean(v.subcategoryId), {
    message: "Provide exactly one of categoryId or subcategoryId",
  });
export type CreateBudgetBody = z.infer<typeof createBudgetBody>;

/**
 * Budget update — only the amount and the frequency can change.
 * (Frequency change is allowed because it doesn't break invariants:
 * the new freq simply determines the next cycle's window. The unique
 * index is on (workspace, target, currency), so frequency isn't
 * part of identity.)
 */
export const updateBudgetBody = z
  .object({
    amount: moneyString,
    frequency: budgetFrequency,
  })
  .strict();
export type UpdateBudgetBody = z.infer<typeof updateBudgetBody>;

// ─── Response shapes ─────────────────────────────────────────────────────

/**
 * Raw budget row, used by the settings list / edit form. Amount is
 * the bigint minor-units value as a string (matches the convention
 * used elsewhere for currency-typed amounts, e.g., account balances).
 */
export type Budget = {
  id: string;
  categoryId: string | null;
  subcategoryId: string | null;
  amount: string;
  currency: string;
  frequency: BudgetFrequency;
};

/**
 * Enriched budget for the chart: includes the target's display names,
 * the *current* cycle window computed from the budget's frequency
 * (1st-of-month, Sunday-start week, fixed-epoch biweekly, etc.), and
 * the actual spend that's landed inside that window so far.
 *
 * `parentRollup === true` flags a synthetic row representing a parent
 * category whose own budget row is null but whose subcategories have
 * budgets — the amount and actual on this row are the per-currency
 * sums across those subcat budgets. Such rows have a `categoryId` but
 * no `id` (there's no DB row to reference) and aren't editable.
 */
export type BudgetSnapshot = {
  id: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryName: string;
  subcategoryName: string | null;
  amount: string;
  currency: string;
  frequency: BudgetFrequency;
  cycleStart: string;
  cycleEnd: string;
  actual: string;
  parentRollup: boolean;
};

/**
 * One historical period in the drill chart: `actual` is the spend
 * inside this cycle's window, `cycleStart`/`cycleEnd` define the
 * window. The chart compares each point against the budget's
 * *current* amount (passed alongside, not on the point) — we don't
 * track historical budget values in v1.
 */
export type BudgetHistoryPoint = {
  cycleStart: string;
  cycleEnd: string;
  actual: string;
};

export type BudgetHistoryResponse = {
  budget: Budget;
  points: BudgetHistoryPoint[];
};
