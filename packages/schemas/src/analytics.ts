import { z } from "zod";

import { currencyField, dateString } from "./common";

export const granularity = z.enum(["daily", "weekly", "monthly", "yearly"]);
export type Granularity = z.infer<typeof granularity>;

// ─── Shared response shapes ───────────────────────────────────────────────

/**
 * One stackable item rendered as a bar segment + legend chip. Used by
 * every analytics chart. `id` is null for synthetic "Other"-style
 * items (e.g., lines with no subcategory in drill mode); the client
 * uses null to disable further drill on that chip.
 */
export type ChartItem = {
  id: string | null;
  name: string;
};

/**
 * Per-period bucket. Each item (category, subcategory, account,
 * subscription, or synthetic bucket — depending on chart + drill) gets
 * a column keyed by its id. Values are numeric in major units
 * (Recharts wants numbers, not bigint strings).
 *
 * `period` is a granularity-shaped label: "2026-04-28" daily,
 * "2026-W17" weekly (ISO), "2026-04" monthly, "2026" yearly.
 */
export type ChartBucket = {
  period: string;
} & Record<string, number | string>;

/**
 * Common response shape across all analytics chart endpoints. The
 * server filters and groups differently per chart, but the wire
 * shape is the same so the client's chart components
 * (`<StackedBarChart>`, `<DivergingNetChart>`) can consume it
 * generically.
 */
export type AnalyticsChartResponse = {
  currency: string;
  items: ChartItem[];
  buckets: ChartBucket[];
};

// ─── By category & tag ────────────────────────────────────────────────────

/**
 * Direction of the by-category-&-tag chart. Drives both the
 * server-side `categories.kind` filter and the client title /
 * defaults.
 */
export const categoryChartDirection = z.enum(["expense", "income"]);
export type CategoryChartDirection = z.infer<typeof categoryChartDirection>;

/**
 * Request shape for the by-category-&-tag chart. Client computes the
 * range — typically a granularity-appropriate trailing window (e.g.,
 * 12 months for `monthly`) — and the server bucket-sums lines into
 * those periods, grouped by category. When `categoryId` is set the
 * chart drills into a single category and groups by subcategory; lines
 * with a null subcategory roll up into a synthetic "Other" item.
 *
 * `tagId` filters lines by tag (the line→tag M2M is the natural place
 * — tags only land on income/expense lines, never on transfer or
 * adjustment legs):
 *   - omitted → no tag filter
 *   - a UUID → only lines tagged with that tag
 *   - "none" → only lines with no tags
 * Multi-tag selection isn't supported.
 */
export const categorySpendingQuery = z.object({
  granularity,
  start: dateString,
  end: dateString,
  currency: currencyField,
  direction: categoryChartDirection.default("expense"),
  categoryId: z.uuid().optional(),
  tagId: z.union([z.uuid(), z.literal("none")]).optional(),
});
export type CategorySpendingQuery = z.infer<typeof categorySpendingQuery>;

// ─── Cash flow (out / in / net) ───────────────────────────────────────────

/**
 * Direction of the cash-flow view. Client-only — never sent over the
 * wire; the server reads direction from the `dimension` prefix
 * (`out*` / `in*` / `net`). Drives the dropdown in the chart UI and
 * determines which dimension defaults to use on switch.
 */
export const cashFlowDirection = z.enum(["out", "in", "net"]);
export type CashFlowDirection = z.infer<typeof cashFlowDirection>;

/**
 * Self-describing dimension keys. The prefix encodes the direction so
 * the server can switch on `dimension` alone — no separate direction
 * field on the wire.
 */
export const cashFlowDimension = z.enum([
  // direction=out
  "outTop", // 3 stacks: Expenses, Loan payments, Subs
  "outExpenses", // drill into Expenses → category stacks
  "outExpensesByCategory", // drill further → subcategory stacks (within one category)
  "outLoans", // drill into Loan payments → per-loan stacks
  "outBills", // drill into Bills → per-bill stacks
  // direction=in
  "inTop", // income by category
  "inByCategory", // drill into a category → subcategory stacks
  // direction=net
  // Two stacks per period: `in` (positive sums) and `out` (signed
  // negative). The Net line is derived client-side as in + out.
  "net",
]);
export type CashFlowDimension = z.infer<typeof cashFlowDimension>;

/**
 * "Cash flow" chart: combined view of money leaving / entering the
 * user's pocket each period.
 *
 * **out** — three top-level stacks (Expenses from CASA/CC, Loan
 * payments, Subs) with drills into each. Excludes adjustments,
 * CASA→CASA transfers, CC payments (settlements), and loan-account
 * expenses (financed purchases — cash surfaces over time as loan
 * payments).
 *
 * **in** sums income transactions by category, with subcategory drill.
 * Mirrors the expense-side drill structure on the income side.
 *
 * **net** returns two stacks per period from CASA/CC legs: `in`
 * (positive sums) and `out` (signed negative). The client renders
 * them as diverging bars and derives the Net line as in + out.
 * Internal transfers (CASA↔CASA, CC payments) are filtered out — they
 * would inflate both bars equally without changing net. Loan-account
 * legs are excluded (financed purchases surface as cash flow when the
 * loan is paid). Adjustments are excluded.
 *
 * `categoryId` is only used for `outExpensesByCategory` and
 * `inByCategory` drills.
 */
export const cashFlowQuery = z.object({
  granularity,
  start: dateString,
  end: dateString,
  currency: currencyField,
  dimension: cashFlowDimension,
  categoryId: z.uuid().optional(),
});
export type CashFlowQuery = z.infer<typeof cashFlowQuery>;

// ─── Net worth ────────────────────────────────────────────────────────────

/**
 * Cumulative balance across all active accounts, split into Assets
 * (checking/savings) and Liabilities (credit_card + loan, signed
 * negative). One value per period at the period's right edge —
 * `SUM(legs.amount)` for that bucket up to and including that period,
 * excluding pending transactions. Adjustments are *included* (they
 * represent real balance changes) and same-currency transfers / CC
 * payments naturally net to zero (both legs land on the user's
 * accounts).
 */
export const netWorthQuery = z.object({
  granularity,
  start: dateString,
  end: dateString,
  currency: currencyField,
});
export type NetWorthQuery = z.infer<typeof netWorthQuery>;
