import { AreaChart, ChartTooltip } from "@mantine/charts";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import type { TooltipContentProps } from "recharts";

type AreaChartProps = ComponentProps<typeof AreaChart>;

/**
 * Drop-in replacement for `<AreaChart>` with two opinionated defaults
 * for stacked / split area charts:
 *
 *   1. `series` is sorted ascending by absolute total across `data`
 *      so the largest contributor sits at the *top* of the stack
 *      (Recharts paints `series[0]` at the bottom, last on top).
 *
 *   2. The tooltip's payload is sorted descending by per-period
 *      value, matching Mantine's value-descending legend. Mantine's
 *      `<AreaChart>` installs its own `content` for Recharts'
 *      Tooltip, which silently bypasses Recharts' built-in
 *      `itemSorter` — so we override `content` here.
 *
 * Net: stack (top-down), legend (left-to-right), and tooltip
 * (top-down) all read biggest-first.
 */
export function SortedAreaChart(props: AreaChartProps) {
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
    return [...series].sort(
      (a, b) => (totals.get(a.name) ?? 0) - (totals.get(b.name) ?? 0),
    );
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
