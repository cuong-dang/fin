import { z } from "zod";

import { dateString } from "./common";

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
 * shape is the same so the client's `<StackedBarChart>` is generic.
 */
export type AnalyticsChartResponse = {
  currency: string;
  items: ChartItem[];
  buckets: ChartBucket[];
};

// ─── Category spending ────────────────────────────────────────────────────

/**
 * Request shape for the category-spending chart. Client computes the
 * range — typically a granularity-appropriate trailing window (e.g.,
 * 12 months for `monthly`) — and the server bucket-sums lines into
 * those periods, group by category. When `categoryId` is set the
 * chart drills into a single category and groups by subcategory; lines
 * with a null subcategory roll up into a synthetic "Other" item.
 */
export const categorySpendingQuery = z.object({
  granularity,
  start: dateString,
  end: dateString,
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase()),
  categoryId: z.uuid().optional(),
});
export type CategorySpendingQuery = z.infer<typeof categorySpendingQuery>;

// ─── Cash flow (out / in / net) ───────────────────────────────────────────

/**
 * Direction of the cash-flow view. Drives the dropdown in the chart
 * UI and determines which dimension defaults to use on switch.
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
  "outSubs", // drill into Subs → per-sub stacks
  // direction=in
  "inTop", // income by category
  "inByCategory", // drill into a category → subcategory stacks
  // direction=net
  "net", // per-period signed total (cash in + cash out, where cash-out legs are already negative)
]);
export type CashFlowDimension = z.infer<typeof cashFlowDimension>;

/**
 * "Cash flow" chart: combined view of money leaving / entering the
 * user's pocket each period.
 *
 * **out** mirrors the previous "Cash out" chart — three top-level
 * stacks (Expenses from CASA/CC, Loan payments, Subs) with the same
 * drills. Excludes adjustments, CASA→CASA transfers, CC payments
 * (settlements), and loan-account expenses (financed purchases — cash
 * surfaces over time as loan payments).
 *
 * **in** sums income transactions by category, with subcategory drill.
 * Mirrors the expense-side drill structure on the income side.
 *
 * **net** sums signed leg amounts on CASA/CC accounts per period,
 * excluding adjustments. Income legs (positive) and outflow legs
 * (negative) cancel naturally; CASA→CASA transfers and CC payments
 * net to 0 because both legs are on CASA/CC. Loan-account legs are
 * excluded (financed purchases don't move cash today).
 *
 * `categoryId` is only used for `outExpensesByCategory` and
 * `inByCategory` drills.
 */
export const cashFlowQuery = z.object({
  granularity,
  start: dateString,
  end: dateString,
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase()),
  dimension: cashFlowDimension.default("outTop"),
  categoryId: z.uuid().optional(),
});
export type CashFlowQuery = z.infer<typeof cashFlowQuery>;
