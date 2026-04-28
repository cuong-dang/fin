import type { Granularity } from "@fin/schemas";
import { SegmentedControl } from "@mantine/core";

import { localDateKey } from "@/lib/dates";

const OPTIONS: { value: Granularity; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (g: Granularity) => void;
}) {
  return (
    <SegmentedControl
      data={OPTIONS}
      value={value}
      onChange={(v) => onChange(v as Granularity)}
    />
  );
}

/**
 * Default trailing window per granularity. Chosen so a single chart
 * fits a screen without overcrowding (~30 ticks max).
 *
 *   daily   → trailing 30 days
 *   weekly  → trailing 12 weeks
 *   monthly → trailing 12 months
 *   yearly  → trailing 5 years
 *
 * The end date is always today (in the user's local tz, per the date
 * convention — server stores date-only with no tz).
 */
export function defaultRange(granularity: Granularity): {
  start: string;
  end: string;
} {
  const today = new Date();
  const end = localDateKey(today);
  const start = new Date(today);
  switch (granularity) {
    case "daily":
      start.setDate(start.getDate() - 30);
      break;
    case "weekly":
      start.setDate(start.getDate() - 12 * 7);
      break;
    case "monthly":
      start.setMonth(start.getMonth() - 12);
      break;
    case "yearly":
      start.setFullYear(start.getFullYear() - 5);
      break;
  }
  return { start: localDateKey(start), end };
}
