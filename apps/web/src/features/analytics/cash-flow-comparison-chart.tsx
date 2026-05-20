import { getCashFlow, listAccountGroups } from "@/lib/endpoints";

import type { Granularity } from "@fin/schemas";
import type { AnalyticsChartResponse } from "@fin/schemas";
import { LineChart, type LineChartSeries } from "@mantine/charts";
import {
  Card,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ChartTitle } from "./chart-title";
import {
  comparisonPeriods,
  dayOfPeriod,
  type Period,
} from "./period-comparison";
import { useCurrencyFormatters } from "./use-currency-formatters";

type Direction = "out" | "in";

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: "out", label: "Out" },
  { value: "in", label: "In" },
];

const ALL_GROUPS = "__all__";

/** Color of the current-period (solid) line. Prior periods carry
 *  their own colors on the `Period` definition. */
const CURRENT_COLOR = "blue";

/**
 * Compares the running total of cash-flow within the current period
 * against the same point in prior period(s). Each granularity maps to
 * its own comparison set (see `period-comparison.ts`):
 *
 *   - Weekly  → this week vs. last week vs. 2 weeks ago
 *   - Monthly → this month vs. last month vs. same month last year
 *   - Yearly  → this year vs. last year
 *   - Daily   → not applicable
 *
 * X-axis is day-of-period (1, 2, 3, …) so the lines align — comparing
 * "where I am on day 15" across periods. Prior (closed) periods that
 * are shorter than the longest period extend their final cumulative
 * value flat to the right edge so the comparison spans the full
 * chart width. The current (in-progress) period stops at today —
 * the line ends honestly rather than implying a flat plateau into
 * the future. No day-count normalization.
 */
export function CashFlowComparisonChart({
  granularity,
  currency,
  withPointLabels,
}: {
  granularity: Granularity;
  currency: string;
  withPointLabels: boolean;
}) {
  const [direction, setDirection] = useState<Direction>("out");
  const [accountGroupId, setAccountGroupId] = useState<string>(ALL_GROUPS);
  const activeAccountGroupId =
    accountGroupId === ALL_GROUPS ? undefined : accountGroupId;

  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const groups = groupsQ.data ?? [];

  // Recompute period ranges only when the granularity changes (today
  // shifts at midnight; a stale "today" for the lifetime of a tab is
  // acceptable for this chart).
  const periods = useMemo(() => comparisonPeriods(granularity), [granularity]);

  const queries = useQueries({
    queries: periods.map((p) => ({
      queryKey: [
        "cash-flow-comparison",
        p.label,
        p.start,
        p.end,
        currency,
        activeAccountGroupId,
      ],
      queryFn: () =>
        getCashFlow({
          granularity: "daily",
          start: p.start,
          end: p.end,
          currency,
          dimension: "net",
          ...(activeAccountGroupId && { accountGroupId: activeAccountGroupId }),
        }),
      enabled: !!currency && periods.length > 0,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const firstError = queries.find((q) => q.error)?.error as Error | undefined;

  // Build the merged chart rows: { day: 1, "This month": 50, "Last month": 30, ... }.
  // Per period, sum the chosen direction's daily values cumulatively
  // and key by day-of-period. Out is flipped to positive to match the
  // CashFlowChart convention (out is shown as a positive magnitude).
  const data = useMemo(
    () => buildChartRows(periods, queries, direction),
    [periods, queries, direction],
  );

  // Only render series that actually have data in at least one row.
  // Otherwise Mantine's point labels format `undefined` through the
  // currency formatter and print "$NaN" for every empty period (e.g.,
  // a user with no transactions a year ago, but data this month).
  const seriesWithData = useMemo(() => {
    const present = new Set<string>();
    for (const row of data) {
      for (const k of Object.keys(row)) if (k !== "day") present.add(k);
    }
    return periods.filter((p) => present.has(p.label));
  }, [data, periods]);

  const series: LineChartSeries[] = seriesWithData.map((p) => ({
    name: p.label,
    label: p.label,
    color: p.isCurrent ? CURRENT_COLOR : (p.color ?? "gray"),
    ...(p.dashArray && { strokeDasharray: p.dashArray }),
  }));

  const fmt = useCurrencyFormatters(currency);

  return (
    <Card>
      <Stack>
        <Group justify="space-between">
          <ChartTitle
            info="Compares the running total of cash flow in the current period against the same
            point in prior periods. Each granularity has its own comparison set: weekly vs. last
            week; monthly vs. last month and same month last year; yearly vs. last year. Daily is
            not applicable. X-axis is day-of-period so lines align (day 15 of this month vs. day 15
            of last month); months of different lengths draw lines of different lengths."
            title="Cashflow pace"
          />
          <Group>
            <SegmentedControl
              data={DIRECTION_OPTIONS}
              value={direction}
              onChange={(v) => setDirection(v as Direction)}
            />
            {groups.length > 0 && (
              <Select
                aria-label="Account group"
                data={[
                  { value: ALL_GROUPS, label: "All account groups" },
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                ]}
                value={accountGroupId}
                onChange={(v) => v && setAccountGroupId(v)}
              />
            )}
          </Group>
        </Group>
        {periods.length === 0 ? (
          <Text c="dimmed">Not applicable for daily granularity.</Text>
        ) : isLoading ? (
          <Text c="dimmed">Loading…</Text>
        ) : firstError ? (
          <Text c="red">Failed to load: {firstError.message}</Text>
        ) : data.length === 0 ? (
          <Text c="dimmed">No data for this view.</Text>
        ) : (
          <LineChart
            curveType="monotone"
            data={data}
            dataKey="day"
            h={300}
            series={series}
            withLegend
            withPointLabels={withPointLabels}
            {...(fmt && {
              // Mantine calls `valueFormatter` for every (row × series)
              // cell, including ones where the series has no value
              // (e.g., days past the current period's last bucket).
              // Without this guard those cells render "$NaN" as point
              // labels — empty string instead so nothing prints.
              valueFormatter: (v) =>
                Number.isFinite(v) ? fmt.tooltipFormatter(v) : "",
              yAxisProps: { tickFormatter: fmt.axisFormatter },
            })}
          />
        )}
      </Stack>
    </Card>
  );
}

type Row = Record<string, number> & { day: number };

/**
 * Reshape parallel daily-cashflow responses into one row per
 * day-of-period across all periods. Each period contributes a
 * cumulative-sum series keyed by its label.
 *
 * Each period's line is drawn from day 1 to the global maxDay across
 * all periods. Days with no transactions inherit the prior day's
 * running total (line stays continuous); days past a period's last
 * bucket also inherit it (line extends flat so the visual comparison
 * lasts the full width of the chart).
 */
function buildChartRows(
  periods: Period[],
  queries: { data?: AnalyticsChartResponse | undefined }[],
  direction: Direction,
): Row[] {
  // First pass: per-period daily deltas + each period's last bucket day.
  const deltas = periods.map((period, i) => {
    const buckets = queries[i]?.data?.buckets ?? [];
    const dailyDelta = new Map<number, number>();
    let lastBucketDay = 0;
    for (const b of buckets) {
      const day = dayOfPeriod(String(b.period), period.start);
      if (day < 1) continue;
      // Out's server values are negative; flip to positive for display.
      const raw = (b[direction] as number | undefined) ?? 0;
      const delta = direction === "out" ? -raw : raw;
      dailyDelta.set(day, (dailyDelta.get(day) ?? 0) + delta);
      if (day > lastBucketDay) lastBucketDay = day;
    }
    return { period, dailyDelta, lastBucketDay };
  });

  const maxDay = deltas.reduce((m, d) => Math.max(m, d.lastBucketDay), 0);
  if (maxDay === 0) return [];

  // Second pass: walk every day for each period. Prior (closed) periods
  // run to `maxDay` and inherit their last running total past their
  // own last bucket — line extends flat to the chart's right edge so
  // the visual comparison spans the full width. The *current*
  // (in-progress) period stops at its own last bucket so the line
  // ends honestly at today rather than implying a flat plateau into
  // the future.
  const rows: Row[] = Array.from({ length: maxDay }, (_, i) => ({
    day: i + 1,
  }));
  for (const { period, dailyDelta, lastBucketDay } of deltas) {
    if (lastBucketDay === 0) continue;
    const stop = period.isCurrent ? lastBucketDay : maxDay;
    let running = 0;
    for (let day = 1; day <= stop; day++) {
      running += dailyDelta.get(day) ?? 0;
      rows[day - 1]![period.label] = running;
    }
  }
  return rows;
}
