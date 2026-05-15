import type { BudgetFrequency } from "@fin/schemas";

/**
 * Budget cycle helpers. Each budget has a frequency (weekly,
 * monthly, quarterly, yearly) and a cycle window is the calendar
 * range over which spending is compared to the budget amount.
 *
 * Anchoring is purely calendar-based: weekly = Sun-Sat, monthly =
 * 1st through last day, quarterly = Jan-Mar / Apr-Jun / Jul-Sep /
 * Oct-Dec, yearly = Jan 1 - Dec 31.
 *
 * All dates here are "YYYY-MM-DD" strings (matching transactions.date,
 * which is a Postgres `DATE` with no timezone). Computations go
 * through `Date` in UTC so DST never shifts a boundary.
 */

export type CycleWindow = {
  /** Inclusive cycle start, "YYYY-MM-DD". */
  start: string;
  /** Inclusive cycle end, "YYYY-MM-DD". */
  end: string;
};

const MS_PER_DAY = 86_400_000;

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/**
 * Return the cycle window containing `today` for the given frequency.
 * `today` is a "YYYY-MM-DD" date — the client provides it so the
 * server doesn't have to guess the user's timezone.
 */
export function currentCycle(
  frequency: BudgetFrequency,
  today: string,
): CycleWindow {
  const t = parseYmd(today);
  switch (frequency) {
    case "weekly": {
      // Sunday-start week containing `today`.
      const dow = t.getUTCDay(); // 0 = Sun
      const start = addDays(t, -dow);
      const end = addDays(start, 6);
      return { start: formatYmd(start), end: formatYmd(end) };
    }
    case "monthly": {
      const y = t.getUTCFullYear();
      const m = t.getUTCMonth();
      const start = new Date(Date.UTC(y, m, 1));
      // Day 0 of next month = last day of this month.
      const end = new Date(Date.UTC(y, m + 1, 0));
      return { start: formatYmd(start), end: formatYmd(end) };
    }
    case "quarterly": {
      const y = t.getUTCFullYear();
      const qStartMonth = Math.floor(t.getUTCMonth() / 3) * 3;
      const start = new Date(Date.UTC(y, qStartMonth, 1));
      const end = new Date(Date.UTC(y, qStartMonth + 3, 0));
      return { start: formatYmd(start), end: formatYmd(end) };
    }
    case "yearly": {
      const y = t.getUTCFullYear();
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
  }
}

/**
 * Return `n` cycle windows ending with the cycle containing `today`,
 * oldest first. Used by the per-budget history chart.
 */
export function pastCycles(
  frequency: BudgetFrequency,
  today: string,
  n: number,
): CycleWindow[] {
  if (n <= 0) return [];
  const out: CycleWindow[] = [];
  // Walk back one day before each prior cycle's start to land in the
  // previous cycle, repeat n-1 times.
  let cycle = currentCycle(frequency, today);
  out.push(cycle);
  for (let i = 1; i < n; i++) {
    const prevDayBeforeStart = addDays(parseYmd(cycle.start), -1);
    cycle = currentCycle(frequency, formatYmd(prevDayBeforeStart));
    out.push(cycle);
  }
  return out.reverse();
}
