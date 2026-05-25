/**
 * Period-comparison ranges per granularity. Drives the
 * "this period vs. prior period(s)" cumulative chart.
 *
 * Pure functions — no React, no fetching. The caller (chart
 * component) feeds these ranges into the daily cash-flow endpoint
 * and reshapes the response into one cumulative series per period,
 * indexed by day-of-period.
 *
 * Sunday is the first day of the week, matching the existing
 * GranularityToggle and `defaultRange`.
 */

import { localDateKey } from "../../lib/dates";

export type Period = {
  /** Display label — "This month", "Last month", "Last year". */
  label: string;
  /** Inclusive start, "YYYY-MM-DD". */
  start: string;
  /** Inclusive end, "YYYY-MM-DD". */
  end: string;
  /** Solid line for the current period; dashed lines for prior periods. */
  isCurrent: boolean;
  /**
   * SVG `strokeDasharray` for prior series. Distinct patterns per
   * series so overlapping dashed lines stay readable. Undefined for
   * the current period (chart picks a solid color).
   */
  dashArray?: string;
  /**
   * Mantine color shorthand for prior series — kept in the gray family
   * so the current period stays visually dominant. Distinct shades so
   * the two prior lines remain distinguishable when they overlap.
   * Undefined for the current period (chart picks the solid color).
   */
  color?: string;
};

/**
 * For a given granularity, return the current period plus the
 * historical periods we want to compare against — in legend order
 * (current first). Returns `[]` when the granularity has no
 * comparison concept (daily).
 */
export function comparisonPeriods(
  granularity: "daily" | "weekly" | "monthly" | "yearly",
  today: Date = new Date(),
): Period[] {
  switch (granularity) {
    case "daily":
      return [];
    case "weekly":
      return weeklyPeriods(today);
    case "monthly":
      return monthlyPeriods(today);
    case "yearly":
      return yearlyPeriods(today);
  }
}

function weeklyPeriods(today: Date): Period[] {
  const thisSunday = startOfWeek(today);
  const lastSunday = addDays(thisSunday, -7);
  const lastSaturday = addDays(thisSunday, -1);
  const twoSundaysAgo = addDays(thisSunday, -14);
  const twoSaturdaysAgo = addDays(lastSunday, -1);
  return [
    {
      label: "This week",
      start: localDateKey(thisSunday),
      end: localDateKey(today),
      isCurrent: true,
    },
    {
      label: "Last week",
      start: localDateKey(lastSunday),
      end: localDateKey(lastSaturday),
      isCurrent: false,
      dashArray: "5 5",
      color: "dark",
    },
    // Two-week comparison covers biweekly pay schedules — "did I burn
    // through my paycheck faster than the previous biweekly cycle?"
    {
      label: "2 weeks ago",
      start: localDateKey(twoSundaysAgo),
      end: localDateKey(twoSaturdaysAgo),
      isCurrent: false,
      dashArray: "10 5",
      color: "gray",
    },
  ];
}

function monthlyPeriods(today: Date): Period[] {
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const lastYearSameMonthStart = new Date(
    today.getFullYear() - 1,
    today.getMonth(),
    1,
  );
  // Day 0 of next month = last day of given month (handles leap Feb).
  const lastYearSameMonthEnd = new Date(
    today.getFullYear() - 1,
    today.getMonth() + 1,
    0,
  );
  return [
    {
      label: "This month",
      start: localDateKey(thisMonthStart),
      end: localDateKey(today),
      isCurrent: true,
    },
    {
      label: "Last month",
      start: localDateKey(lastMonthStart),
      end: localDateKey(lastMonthEnd),
      isCurrent: false,
      dashArray: "5 5",
      color: "dark",
    },
    {
      label: "Last year",
      start: localDateKey(lastYearSameMonthStart),
      end: localDateKey(lastYearSameMonthEnd),
      isCurrent: false,
      dashArray: "10 5",
      color: "gray",
    },
  ];
}

function yearlyPeriods(today: Date): Period[] {
  const thisYearStart = new Date(today.getFullYear(), 0, 1);
  const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);
  return [
    {
      label: "This year",
      start: localDateKey(thisYearStart),
      end: localDateKey(today),
      isCurrent: true,
    },
    {
      label: "Last year",
      start: localDateKey(lastYearStart),
      end: localDateKey(lastYearEnd),
      isCurrent: false,
      dashArray: "5 5",
      color: "dark",
    },
  ];
}

/** Sunday of the week containing `d` (local time). */
function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - r.getDay()); // getDay(): Sun=0
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Day-of-period index (1-based) for an absolute date within a period.
 * `bucketDate` and `periodStart` are "YYYY-MM-DD" strings.
 */
export function dayOfPeriod(bucketDate: string, periodStart: string): number {
  const [by, bm, bd] = bucketDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [sy, sm, sd] = periodStart.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(sy, sm - 1, sd);
  return Math.floor(ms / 86_400_000) + 1;
}

/**
 * Month-of-period index (1-based). Used by the yearly comparison
 * view, which fetches monthly buckets (1–12 over the year) rather
 * than daily buckets (1–365). `bucketLabel` is the "YYYY-MM" string
 * emitted by the monthly cash-flow query; `periodStart` is the
 * "YYYY-MM-DD" start of the period (e.g., Jan 1 of the year).
 */
export function monthOfPeriod(
  bucketLabel: string,
  periodStart: string,
): number {
  const [by, bm] = bucketLabel.split("-").map(Number) as [number, number];
  const [sy, sm] = periodStart.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return (by - sy) * 12 + (bm - sm) + 1;
}
