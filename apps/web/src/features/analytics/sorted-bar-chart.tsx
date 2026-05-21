import {
  ChartTooltip,
  CompositeChart,
  type CompositeChartSeries,
} from "@mantine/charts";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import type { TooltipContentProps } from "recharts";

import { PALETTE } from "./palette";
import { useTouchAwareTooltip } from "./use-touch-aware-tooltip";

type CompositeChartProps = ComponentProps<typeof CompositeChart>;

// Caller passes series without a color or type — SortedBarChart
// assigns palette colors itself based on sort rank and forces
// `type: "bar"` on every entry.
type SortedBarSeries = { name: string; label: string };

type SortedBarChartProps = Omit<CompositeChartProps, "series" | "type"> & {
  series: SortedBarSeries[];
  /**
   * When true, label the total above each stack (one label per
   * bucket). Implemented via an invisible line series — see comment
   * below.
   */
  withPointLabels?: boolean;
};

// Sentinel data-field + series name for the invisible "total" line
// that carries the per-bucket sum used for top-of-stack labels.
// Chosen to be unlikely to collide with a real series id.
const TOTAL_KEY = "__sorted_bar_total__";

/**
 * Stacked bar chart with three opinionated defaults:
 *
 *   1. Series sorted ascending by abs total — the largest contributor
 *      ends up at the top of the stack (Recharts paints `series[0]`
 *      at the bottom, last on top).
 *
 *   2. Palette colors assigned by rank post-sort — biggest stack
 *      gets `PALETTE[0]`, then `PALETTE[1]`, and so on. Consistent
 *      color ordering across views is the point.
 *
 *   3. Tooltip + legend reorder to read largest-first.
 *
 * Total labels (`withPointLabels`) are a hack on top of Mantine's
 * `CompositeChart`: Mantine's `withBarValueLabel` labels every
 * stacked segment, not the stack's total. To get one label per
 * bucket, we add an invisible `type: "line"` series whose y value at
 * each x is the bucket sum, with `withDots={false}` and transparent
 * stroke, then let Mantine's `withPointLabels` draw labels at those
 * (x, total) anchor points. The line itself doesn't render — only
 * its labels.
 */
export function SortedBarChart({
  data,
  series,
  legendProps,
  tooltipProps,
  valueFormatter,
  withPointLabels = false,
  ...rest
}: SortedBarChartProps) {
  const {
    tooltipProps: touchTooltipProps,
    wrapperRef,
    resetKey,
  } = useTouchAwareTooltip();

  // Sort + color
  const sortedSeries = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of series) {
      let sum = 0;
      for (const row of data as Record<string, unknown>[]) {
        const v = row[s.name];
        if (typeof v === "number") sum += Math.abs(v);
      }
      totals.set(s.name, sum);
    }
    const sorted = [...series].sort(
      (a, b) => (totals.get(a.name) ?? 0) - (totals.get(b.name) ?? 0),
    );
    const n = sorted.length;
    return sorted.map((s, i) => ({
      name: s.name,
      label: s.label,
      color: PALETTE[(n - 1 - i) % PALETTE.length]!,
      type: "bar" as const,
    }));
  }, [series, data]);

  // Inject a `_total` field per bucket when point labels are on; the
  // line series reads it.
  const augmentedData = useMemo(() => {
    if (!withPointLabels) return data;
    return (data as Record<string, unknown>[]).map((row) => {
      let total = 0;
      for (const s of series) {
        const v = row[s.name];
        if (typeof v === "number") total += v;
      }
      return { ...row, [TOTAL_KEY]: total };
    });
  }, [data, series, withPointLabels]);

  const compositeSeries: CompositeChartSeries[] = useMemo(
    () =>
      withPointLabels
        ? [
            ...sortedSeries,
            // `color: "none"` is load-bearing twice: (1) Recharts'
            // `<Line stroke="none">` doesn't render, so the line + dots
            // are invisible and only the `withPointLabels` labels show;
            // (2) Mantine's `ChartLegend` auto-filters payload items
            // whose color is "none" (see `getFilteredChartLegendPayload`
            // in @mantine/charts), so the total series doesn't appear
            // as a legend entry.
            {
              name: TOTAL_KEY,
              label: "Total",
              color: "none",
              type: "line",
            },
          ]
        : sortedSeries,
    [sortedSeries, withPointLabels],
  );

  // Legend item order: largest stack first. Recharts 3 dropped the
  // public `legendProps.payload` override, so we steer via
  // `itemSorter` (sorted ascending → return negative for descending).
  const totalsByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sortedSeries) {
      let sum = 0;
      for (const row of data as Record<string, unknown>[]) {
        const v = row[s.name];
        if (typeof v === "number") sum += Math.abs(v);
      }
      m.set(s.name, sum);
    }
    return m;
  }, [sortedSeries, data]);
  const legendItemSorter = (entry: {
    dataKey?: string | number | ((obj: unknown) => unknown);
  }) =>
    -(
      totalsByName.get(
        typeof entry.dataKey === "string" || typeof entry.dataKey === "number"
          ? String(entry.dataKey)
          : "",
      ) ?? 0
    );

  const renderTooltip = ({
    label,
    payload,
    labelFormatter,
  }: TooltipContentProps<number, string>) => (
    <ChartTooltip
      label={labelFormatter && payload ? labelFormatter(label, payload) : label}
      payload={
        payload
          ? [...payload]
              .filter((p) => p.dataKey !== TOTAL_KEY)
              .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
          : payload
      }
      series={sortedSeries}
      {...(valueFormatter && { valueFormatter })}
    />
  );

  return (
    <div ref={wrapperRef}>
      <CompositeChart
        key={resetKey}
        barProps={{ stackId: "stack" }}
        data={augmentedData}
        legendProps={{ itemSorter: legendItemSorter, ...legendProps }}
        series={compositeSeries}
        tooltipProps={{
          content: renderTooltip,
          ...touchTooltipProps,
          ...tooltipProps,
        }}
        withDots={false}
        withPointLabels={withPointLabels}
        {...(valueFormatter && { valueFormatter })}
        {...rest}
      />
    </div>
  );
}
