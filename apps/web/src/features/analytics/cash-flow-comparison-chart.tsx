import { MultiSelectChecklist } from "@/components/multi-select-checklist";
import { getCashFlow, listAccountGroups } from "@/lib/endpoints";

import type { Granularity } from "@fin/schemas";
import type { AnalyticsChartResponse } from "@fin/schemas";
import { LineChart, type LineChartSeries } from "@mantine/charts";
import { Card, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { POINT_LABEL_MARGIN_RIGHT } from "./chart-config";
import { ChartTitle } from "./chart-title";
import {
  comparisonPeriods,
  dayOfPeriod,
  monthOfPeriod,
  type Period,
} from "./period-comparison";
import { useCurrencyFormatters } from "./use-currency-formatters";
import { useTouchAwareTooltip } from "./use-touch-aware-tooltip";

type Direction = "out" | "in";

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: "out", label: "Out" },
  { value: "in", label: "In" },
];

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

  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);

  // See `CashFlowChart` for the multi-select semantics — same here.
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[] | null>(
    null,
  );
  const allGroupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const accountGroupIds = useMemo(() => {
    if (selectedGroupIds === null) return undefined;
    if (
      selectedGroupIds.length === allGroupIds.length &&
      selectedGroupIds.every((id) => allGroupIds.includes(id))
    )
      return undefined;
    return selectedGroupIds;
  }, [selectedGroupIds, allGroupIds]);

  // Recompute period ranges only when the granularity changes (today
  // shifts at midnight; a stale "today" for the lifetime of a tab is
  // acceptable for this chart).
  const periods = useMemo(() => comparisonPeriods(granularity), [granularity]);

  // Yearly periods cover up to 365 days — far too many points to plot
  // meaningfully. Aggregate to monthly buckets (1–12 across the year)
  // instead. The bucket-index helper changes shape accordingly:
  // `dayOfPeriod` for daily buckets, `monthOfPeriod` for monthly.
  const bucketGranularity = granularity === "yearly" ? "monthly" : "daily";
  const bucketIndex = granularity === "yearly" ? monthOfPeriod : dayOfPeriod;

  // Same trick as `CashFlowChart`: if the user has explicitly emptied
  // the multi-select, skip the fetch (empty array serializes to no
  // query param, which the server would misread as "no filter").
  const filterIsEmpty =
    selectedGroupIds !== null && selectedGroupIds.length === 0;

  const queries = useQueries({
    queries: periods.map((p) => ({
      queryKey: [
        "cash-flow-comparison",
        p.label,
        p.start,
        p.end,
        currency,
        accountGroupIds,
        bucketGranularity,
      ],
      queryFn: () =>
        getCashFlow({
          granularity: bucketGranularity,
          start: p.start,
          end: p.end,
          currency,
          dimension: "net",
          ...(accountGroupIds && { accountGroupIds }),
        }),
      enabled: !!currency && periods.length > 0 && !filterIsEmpty,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const firstError = queries.find((q) => q.error)?.error as Error | undefined;

  // Build the merged chart rows: { day: 1, "This month": 50, "Last month": 30, ... }.
  // Per period, sum the chosen direction's bucketed values cumulatively
  // and key by bucket-of-period. Out is flipped to positive to match the
  // CashFlowChart convention (out is shown as a positive magnitude).
  const data = useMemo(
    () => buildChartRows(periods, queries, direction, bucketIndex),
    [periods, queries, direction, bucketIndex],
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
  const {
    tooltipProps: touchTooltipProps,
    wrapperRef,
    resetKey,
  } = useTouchAwareTooltip();

  return (
    <Card>
      <Stack>
        <Group justify="space-between">
          <ChartTitle
            info="Compares the running total of cash flow in the current period against the same
            point in prior periods. Each granularity has its own comparison set: weekly vs. last
            week; monthly vs. last month and same month last year; yearly vs. last year. Daily is
            not applicable. X-axis is bucket-of-period so lines align — day-of-period for weekly /
            monthly (day 15 of this month vs. day 15 of last month), month-of-year for yearly
            (1–12); months of different lengths draw lines of different lengths."
            title="Cashflow pace"
          />
          <Group>
            <SegmentedControl
              data={DIRECTION_OPTIONS}
              value={direction}
              onChange={(v) => setDirection(v as Direction)}
            />
            {groups.length > 0 && (
              <MultiSelectChecklist
                allLabel="All groups"
                ariaLabel="Account groups"
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
                value={selectedGroupIds}
                onChange={setSelectedGroupIds}
              />
            )}
          </Group>
        </Group>
        <div ref={wrapperRef}>
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
              key={resetKey}
              curveType="monotone"
              data={data}
              dataKey="day"
              h={500}
              // Reserve right-side margin when point labels are on so
              // the last bucket's label doesn't clip the SVG edge —
              // same convention as DivergingNetChart.
              {...(withPointLabels && {
                lineChartProps: {
                  margin: { right: POINT_LABEL_MARGIN_RIGHT },
                },
              })}
              series={series}
              tooltipProps={touchTooltipProps}
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
        </div>
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
  bucketIndex: (bucketLabel: string, periodStart: string) => number,
): Row[] {
  // First pass: per-period bucketed deltas + each period's extent. The
  // extent is the bucket index the line should draw up to:
  //   - Current (in-progress): today's bucket-of-period, regardless of
  //     whether there's actually data through today. A spend-free
  //     Friday should still see the line extend out to Friday at the
  //     prior running total, not stop at Thursday.
  //   - Prior (closed): the last bucket with data — the period's full
  //     real span (e.g., 30 or 31 for a calendar month, 12 for a year).
  const deltas = periods.map((period, i) => {
    const buckets = queries[i]?.data?.buckets ?? [];
    const dailyDelta = new Map<number, number>();
    let lastBucketDay = 0;
    for (const b of buckets) {
      const day = bucketIndex(String(b.period), period.start);
      if (day < 1) continue;
      // Out's server values are negative; flip to positive for display.
      const raw = (b[direction] as number | undefined) ?? 0;
      const delta = direction === "out" ? -raw : raw;
      dailyDelta.set(day, (dailyDelta.get(day) ?? 0) + delta);
      if (day > lastBucketDay) lastBucketDay = day;
    }
    const extent = period.isCurrent
      ? bucketIndex(period.end, period.start)
      : lastBucketDay;
    return { period, dailyDelta, extent };
  });

  const maxDay = deltas.reduce((m, d) => Math.max(m, d.extent), 0);
  if (maxDay === 0) return [];

  // Second pass: walk every day for each period. Prior (closed) periods
  // run to `maxDay` and inherit their last running total past their
  // own last bucket — line extends flat to the chart's right edge so
  // the visual comparison spans the full width. The *current*
  // (in-progress) period stops at today so the line ends honestly
  // rather than implying a flat plateau into the future.
  const rows: Row[] = Array.from({ length: maxDay }, (_, i) => ({
    day: i + 1,
  }));
  for (const { period, dailyDelta, extent } of deltas) {
    if (extent === 0) continue;
    const stop = period.isCurrent ? extent : maxDay;
    let running = 0;
    for (let day = 1; day <= stop; day++) {
      running += dailyDelta.get(day) ?? 0;
      rows[day - 1]![period.label] = running;
    }
  }
  return rows;
}
