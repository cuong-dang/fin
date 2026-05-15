import type { BudgetFrequency } from "@fin/schemas";

export const BUDGET_FREQUENCY_OPTIONS: {
  value: BudgetFrequency;
  label: string;
}[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

/** Short suffix used in compact displays, e.g. "$200/mo". */
export const BUDGET_FREQUENCY_SHORT: Record<BudgetFrequency, string> = {
  weekly: "/wk",
  monthly: "/mo",
  quarterly: "/qtr",
  yearly: "/yr",
};
