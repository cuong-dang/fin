import { CompositeChart, type CompositeChartSeries } from "@mantine/charts";
import type { ComponentProps } from "react";

import { POINT_LABEL_MARGIN_RIGHT } from "./chart-config";
import { useTouchAwareTooltip } from "./use-touch-aware-tooltip";

type CompositeChartProps = ComponentProps<typeof CompositeChart>;

type SeriesSpec = { name: string; label: string };

/**
 * Diverging stacked-area chart with a net line on top — used by both
 * net-worth (Assets / Liabilities / Net worth) and cash-flow's net
 * direction (Cash in / Cash out / Net).
 *
 * Recharts' `stackOffset="sign"` (passed through Mantine's
 * `composedChartProps`) makes same-sign values stack on the same
 * side of zero, so positive-value `positive` stacks upward and
 * negative-value `negative` stacks downward. The `net` line traces
 * positive + negative across the period.
 *
 * Colors are semantic and hardcoded — teal/red/dark — rather than
 * picked from PALETTE by rank, because the meaning of each band
 * (growth / debt / overall) is fixed.
 */
export function DivergingNetChart({
  data,
  positive,
  negative,
  net,
  valueFormatter,
  yAxisProps,
  withPointLabels = false,
  h = 500,
}: {
  data: CompositeChartProps["data"];
  /** Series whose values are ≥ 0 (e.g., assets, cash in). */
  positive: SeriesSpec;
  /** Series whose values are ≤ 0 (e.g., liabilities, cash out). */
  negative: SeriesSpec;
  /** Per-period sum of `positive + negative`, rendered as a line. */
  net: SeriesSpec;
  valueFormatter?: ((v: number) => string) | undefined;
  yAxisProps?: CompositeChartProps["yAxisProps"] | undefined;
  withPointLabels?: boolean;
  h?: number;
}) {
  const {
    tooltipProps: touchTooltipProps,
    wrapperRef,
    resetKey,
  } = useTouchAwareTooltip();
  const series: CompositeChartSeries[] = [
    {
      name: positive.name,
      label: positive.label,
      color: "teal",
      type: "area",
    },
    {
      name: negative.name,
      label: negative.label,
      color: "red",
      type: "area",
    },
    { name: net.name, label: net.label, color: "dark", type: "line" },
  ];

  // Recharts' ComposedChart, with `stackOffset="sign"`, can slot the
  // line between the positive and negative stacks in the legend
  // depending on per-period values — not what we want. Force the
  // legend to read positive → negative → net via Recharts' Legend
  // `itemSorter` (a sort-key function applied before Mantine's
  // custom `content` callback runs).
  const legendOrder = [positive.name, negative.name, net.name];

  // When point labels are on, reserve right-side margin so the
  // largest-magnitude label (often the negative liabilities stack)
  // doesn't clip against the SVG edge.
  const composedChartProps: CompositeChartProps["composedChartProps"] = {
    stackOffset: "sign",
    ...(withPointLabels && { margin: { right: POINT_LABEL_MARGIN_RIGHT } }),
  };

  return (
    <div ref={wrapperRef}>
      <CompositeChart
        key={resetKey}
        composedChartProps={composedChartProps}
        curveType="monotone"
        data={data}
        dataKey="period"
        h={h}
        legendProps={{
          itemSorter: (item) => {
            const idx = legendOrder.indexOf(String(item.dataKey));
            return idx === -1 ? legendOrder.length : idx;
          },
        }}
        series={series}
        tooltipProps={touchTooltipProps}
        withLegend
        withPointLabels={withPointLabels}
        {...(valueFormatter && { valueFormatter })}
        {...(yAxisProps && { yAxisProps })}
      />
    </div>
  );
}
