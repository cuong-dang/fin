"use client";

import { localDateKey } from "@/lib/dates";

/**
 * Hidden input whose value is the browser's local "today" in YYYY-MM-DD.
 * Renders empty on SSR (server's timezone isn't the user's), then the browser
 * produces the real value after hydration. `suppressHydrationWarning` tells
 * React this mismatch is intentional. Server actions should fall back to
 * todayUTCDate() when the submitted value is absent (e.g. form submitted
 * before JS hydrates).
 */
export function LocalTodayInput({ name }: { name: string }) {
  const value = typeof window === "undefined" ? "" : localDateKey(new Date());
  return (
    <input
      type="hidden"
      name={name}
      value={value}
      readOnly
      suppressHydrationWarning
    />
  );
}
