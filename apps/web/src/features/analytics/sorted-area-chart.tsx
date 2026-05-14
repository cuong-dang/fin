import { AreaChart, ChartTooltip } from "@mantine/charts";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import type { TooltipContentProps } from "recharts";

import { PALETTE } from "./palette";

type AreaChartProps = ComponentProps<typeof AreaChart>;
type AreaChartSeries = AreaChartProps["series"][number];

// Caller passes series without a color — SortedAreaChart assigns
// palette colors itself based on sort rank. Anything else
// (`name`, `label`) passes through.
type SortedAreaSeries = Omit<AreaChartSeries, "color">;

type SortedAreaChartProps = Omit<AreaChartProps, "series"> & {
  series: SortedAreaSeries[];
};

/**
 * Drop-in replacement for `<AreaChart>` with three opinionated
 * defaults for stacked / split area charts:
 *
 *   1. `series` is sorted ascending by absolute total across `data`
 *      so the largest contributor sits at the *top* of the stack
 *      (Recharts paints `series[0]` at the bottom, last on top).
 *
 *   2. Colors are reassigned *after* the sort: the largest stack
 *      (top of the chart, left of the legend, top of the tooltip)
 *      gets `PALETTE[0]`, the next-largest `PALETTE[1]`, and so on.
 *      Any caller-supplied `color` on a series entry is overridden —
 *      consistent color ordering across the three views is the point.
 *
 *   3. The tooltip's payload is sorted descending by per-period
 *      value, matching Mantine's value-descending legend. Mantine's
 *      `<AreaChart>` installs its own `content` for Recharts'
 *      Tooltip, which silently bypasses Recharts' built-in
 *      `itemSorter` — so we override `content` here.
 *
 * Net: stack (top-down), legend (left-to-right), and tooltip
 * (top-down) all read biggest-first *and* in the same color order.
 */
export function SortedAreaChart(props: SortedAreaChartProps) {
  const { data, series, tooltipProps, valueFormatter, ...rest } = props;

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
    // Color by rank, biggest-first. `sorted` is ascending by total,
    // so the LAST entry is the top of the stack — it should get
    // `PALETTE[0]`. Index from the end.
    const n = sorted.length;
    return sorted.map((s, i) => ({
      ...s,
      color: PALETTE[(n - 1 - i) % PALETTE.length],
    }));
  }, [series, data]);

  const renderTooltip = ({
    label,
    payload,
    labelFormatter,
  }: TooltipContentProps<number, string>) => (
    <ChartTooltip
      label={labelFormatter && payload ? labelFormatter(label, payload) : label}
      payload={
        payload
          ? [...payload].sort(
              (a, b) => (Number(b.value) || 0) - (Number(a.value) || 0),
            )
          : payload
      }
      series={sortedSeries}
      {...(valueFormatter && { valueFormatter })}
    />
  );

  return (
    <AreaChart
      data={data}
      series={sortedSeries}
      tooltipProps={{ content: renderTooltip, ...tooltipProps }}
      {...(valueFormatter && { valueFormatter })}
      {...rest}
    />
  );
}
