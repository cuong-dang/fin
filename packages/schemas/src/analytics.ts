import { z } from "zod";

import { billType } from "./bills.js";
import { currencyField, dateString, optionalUuid } from "./common.js";

export const granularity = z.enum(["daily", "weekly", "monthly", "yearly"]);
export type Granularity = z.infer<typeof granularity>;

/**
 * Fields every analytics chart accepts on the wire: window + currency.
 * Each chart's query schema extends this with its own filter axes.
 * File-private — the chart-specific schemas below are the public API.
 */
const baseChartQuery = z.object({
  granularity,
  start: dateString,
  end: dateString,
  currency: currencyField,
});

// ─── Cash flow (out / in / net) ───────────────────────────────────────────

/**
 * Self-describing dimension keys. The prefix encodes the direction so
 * the server can switch on `dimension` alone — no separate direction
 * field on the wire. The naming convention `out<Thing>By<Filter>` =
 * "drilled into one `<Filter>` value, broken down by `<Thing>`".
 */
export const cashFlowDimension = z.enum([
  // direction=out
  "outTop", // 3 stacks: expense / loan / bill
  "outExpenses", // stack by category
  "outExpensesByCategory", // one category → subcategory stack (requires categoryId; with subcategoryId → single series)
  "outLoans", // per-loan stacks (with loanId → single series)
  "outBills", // 3 stacks: utility / subscription / other
  "outBillsByType", // one bill type → per-bill stack (requires billType; with billId → single series)
  // direction=in
  "inTop", // stack by income category
  "inByCategory", // one category → subcategory stack (requires categoryId; with subcategoryId → single series)
  // direction=net
  // Two stacks per period: `in` (positive sums) and `out` (signed
  // negative). The client renders them as diverging bars.
  "net",
]);
export type CashFlowDimension = z.infer<typeof cashFlowDimension>;

/**
 * "Cash flow" chart: combined view of money leaving / entering the
 * user's pocket each period.
 *
 * **out** — three top-level stacks (expense from CASA/CC, loan
 * payments, bills) with drills into each. Excludes adjustments,
 * CASA→CASA transfers, CC payments (settlements), and loan-account
 * expenses (financed purchases — cash surfaces over time as loan
 * payments).
 *
 * **in** sums income transactions by category, with subcategory drill.
 *
 * **net** returns two stacks per period from CASA/CC legs: `in`
 * (positive sums) and `out` (signed negative). Internal transfers
 * (CASA↔CASA, CC payments) are filtered out — they would inflate both
 * bars equally without changing net. Loan-account legs are excluded
 * (financed purchases surface as cash flow when the loan is paid).
 * Adjustments are excluded.
 */
export const cashFlowQuery = baseChartQuery.extend({
  dimension: cashFlowDimension,
  // Optional filter to one account group (sidebar UX). Independent of
  // the drill axis.
  accountGroupId: optionalUuid,
  // Drill filters. The client only sends each one with its compatible
  // dimension; the server treats illegal combos as a no-op.
  // - categoryId     : required for `outExpensesByCategory` and `inByCategory`.
  // - subcategoryId  : restricts the above to one subcategory (leaf, single series).
  // - billType       : required for `outBillsByType`.
  // - billId         : restricts `outBillsByType` to one specific bill (leaf, single series).
  // - loanId         : restricts `outLoans` to one specific loan (leaf, single series).
  categoryId: optionalUuid,
  subcategoryId: optionalUuid,
  billType: billType.optional(),
  billId: optionalUuid,
  loanId: optionalUuid,
});
export type CashFlowQuery = z.infer<typeof cashFlowQuery>;

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
 * those periods, grouped by category.
 *
 * Drill levels mirror cash-flow's category branch:
 *   - top              → stacked by category (of the chosen kind).
 *   - `categoryId` set → drilled into one category, stacked by
 *     subcategory; lines with a null subcategory roll up under
 *     "Other" with id=null.
 *   - `subcategoryId` set (along with `categoryId`) → leaf: a single
 *     series for that one subcategory.
 *
 * `tagId` filters lines by tag (the line→tag M2M is the natural place
 * — tags only land on income/expense lines, never on transfer or
 * adjustment legs):
 *   - omitted → no tag filter
 *   - a UUID → only lines tagged with that tag
 *   - "__none__" → only lines with no tags
 * Multi-tag selection isn't supported. (TODO?)
 */
export const categoryTagQuery = baseChartQuery.extend({
  direction: categoryChartDirection.default("expense"),
  categoryId: optionalUuid,
  subcategoryId: optionalUuid,
  tagId: z.union([z.uuid(), z.literal("__none__")]).optional(),
});
export type CategoryTagQuery = z.infer<typeof categoryTagQuery>;

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
export const netWorthQuery = baseChartQuery;
export type NetWorthQuery = z.infer<typeof netWorthQuery>;

// ─── Shared response shapes ───────────────────────────────────────────────
/**
 * Common response shape across all analytics chart endpoints. The
 * server filters and groups differently per chart, but the wire shape
 * is the same so a single Mantine `<AreaChart>` can consume it
 * generically (`buckets` → `data`, `items` → `series`).
 */
export type AnalyticsChartResponse = {
  currency: string;
  items: ChartItem[];
  buckets: ChartBucket[];
};

/**
 * One series in the chart (a stacked area + a legend chip). Used by
 * every analytics chart.
 *
 * - `id`   — wire key. Doubles as the column name on each
 *   `ChartBucket`, so the client reads its values via `bucket[id]`,
 *   and as Mantine's `series.name` (its internal data-key).
 *   `null` marks a synthetic "Other"-style item (e.g., lines with no
 *   subcategory in drill mode); the client uses `null` to disable
 *   further drill on that chip.
 * - `name` — display label shown in the legend and tooltip. Mantine's
 *   `series.label`. May be the same string as `id` when the server's
 *   group key is already user-readable (e.g., bill type "utility");
 *   the client may remap to a friendlier label via `displayItemName`.
 */
export type ChartItem = {
  id: string | null;
  name: string;
};

/**
 * One row of chart data — the value of every series at a single
 * period. Each `ChartItem.id` becomes a property on this object,
 * whose value is the series' sum for that period in major currency
 * units (the chart consumes plain numbers, not bigint strings).
 *
 * `period` is a granularity-shaped label produced by Postgres
 * `to_char`: "2026-04-28" daily, "Apr 26" weekly (Sun-starting),
 * "2026-04" monthly, "2026" yearly. The client passes this string
 * straight through as the chart's X-axis category.
 *
 * Why `number | string` in the index signature: TS can't express
 * "every key except `period` is a number" — `{ period: string } &
 * Record<string, number>` collapses to `never` for `period`. The
 * `string` half of the union exists solely to accommodate `period`;
 * every other key is a `number` at runtime.
 */
export type ChartBucket = {
  period: string;
} & Record<string, number | string>;
