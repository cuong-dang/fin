/**
 * Human-friendly date header for transaction lists. Input is a canonical
 * "YYYY-MM-DD" calendar-date string (matches `transactions.date`).
 * Returns Today / Yesterday / "Fri, Apr 4" / "Fri, Apr 4, 2024" depending
 * on recency, compared against the viewer's local "today".
 */
export function formatDayHeader(date: string, now: Date = new Date()): string {
  const today = localDateKey(now);
  if (date === today) return "Today";

  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (date === localDateKey(y)) return "Yesterday";

  const [yr, mo, dy] = date.split("-").map(Number);
  const asDate = new Date(yr, mo - 1, dy);
  const sameYear = yr === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(asDate);
}

/** "YYYY-MM-DD" in the local timezone for a Date. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Today's date as "YYYY-MM-DD" in UTC. Used as a server-side default for
 * auto-generated transactions (starting balance, balance adjustments) where
 * the user's timezone isn't available. For user-entered transactions, read
 * the date from the form (client computes it in its own timezone).
 */
export function todayUTCDate(): string {
  return new Date().toISOString().slice(0, 10);
}
