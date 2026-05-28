import {
  ChartTooltip,
  CompositeChart,
  type CompositeChartSeries,
} from "@mantine/charts";
import { ColorSwatch, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
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

  // Series the user has clicked off in the legend. Stored as series
  // `name` keys. Clicking the same legend entry again toggles back.
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Currently hovered legend item — drives the chart-side highlight
  // (other series dim via `fillOpacity`). On touch devices we skip
  // hover wiring entirely: a tap fires mouseenter → click →
  // mouseleave back-to-back, which would flash the highlight, and on
  // some browsers `:hover`-equivalent state sticks after a tap and
  // leaves series dimmed indefinitely.
  const coarse = useMediaQuery("(pointer: coarse)") ?? false;
  const [highlighted, setHighlighted] = useState<string | null>(null);

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
  // line series reads it. Hidden series are excluded so the label
  // matches the visible stack height.
  const augmentedData = useMemo(() => {
    if (!withPointLabels) return data;
    return (data as Record<string, unknown>[]).map((row) => {
      let total = 0;
      for (const s of series) {
        if (hidden.has(s.name)) continue;
        const v = row[s.name];
        if (typeof v === "number") total += v;
      }
      return { ...row, [TOTAL_KEY]: total };
    });
  }, [data, series, withPointLabels, hidden]);

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

  // Custom legend: Mantine's ChartLegend (the default `content`)
  // only wires hover effects on items, no click handler. We render
  // our own so clicking toggles series visibility and hidden series
  // dim in place. The invisible "Total" line series (color === "none")
  // is filtered out, matching Mantine's behavior.
  const toggleHidden = (key: string) => {
    if (!key || key === TOTAL_KEY) return;
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const renderLegend = ({
    payload,
  }: {
    payload?: readonly LegendPayload[];
  }) => {
    if (!payload) return null;
    const items = [...payload].filter((p) => p.color !== "none");
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "flex-end",
          height: "100%",
          // Match Mantine's `.m_847eaf[data-position='top']` rule —
          // creates breathing room between the legend and the
          // chart's plotting area below.
          paddingBottom: "var(--mantine-spacing-md)",
        }}
      >
        {items.map((item) => {
          const key =
            typeof item.dataKey === "string" || typeof item.dataKey === "number"
              ? String(item.dataKey)
              : "";
          const label =
            sortedSeries.find((s) => s.name === key)?.label ??
            item.value ??
            key;
          return (
            <LegendItemRow
              key={key}
              colorStr={typeof item.color === "string" ? item.color : ""}
              hidden={hidden.has(key)}
              hoverEnabled={!coarse}
              label={label}
              onClick={() => toggleHidden(key)}
              onHoverEnd={() => setHighlighted(null)}
              onHoverStart={() => setHighlighted(key)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div ref={wrapperRef}>
      <CompositeChart
        key={resetKey}
        // `barProps` per-series: `hide` removes the bar from the stack
        // but keeps its legend entry so the user can click it back.
        // When a legend item is hovered, the other series dim via
        // `fillOpacity` — mirrors Mantine's default highlight effect.
        barProps={(s) => ({
          stackId: "stack",
          hide: hidden.has(s.name),
          ...(highlighted !== null &&
            highlighted !== s.name && { fillOpacity: 0.4 }),
        })}
        data={augmentedData}
        legendProps={{
          itemSorter: legendItemSorter,
          content: renderLegend,
          ...legendProps,
        }}
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

type LegendPayload = {
  dataKey?: string | number | ((obj: unknown) => unknown) | undefined;
  color?: string | undefined;
  value?: string | undefined;
};

/**
 * Single legend row. Styling mirrors Mantine's own `ChartLegend`
 * (m_17da7e62): 7px vertical / xs horizontal padding, default radius,
 * 7px gap between swatch and label, theme-aware hover background.
 * Click toggles visibility (handled by parent). Hover handlers fire
 * only on fine-pointer devices — see `coarse` plumbing in the
 * parent.
 */
function LegendItemRow({
  colorStr,
  label,
  hidden,
  hoverEnabled,
  onClick,
  onHoverStart,
  onHoverEnd,
}: {
  colorStr: string;
  label: string;
  hidden: boolean;
  hoverEnabled: boolean;
  onClick: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  return (
    <UnstyledButton
      aria-pressed={!hidden}
      className="sorted-bar-legend-item"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "calc(0.4375rem * var(--mantine-scale))",
        padding: "7px var(--mantine-spacing-xs)",
        borderRadius: "var(--mantine-radius-default)",
        opacity: hidden ? 0.4 : 1,
      }}
      onClick={onClick}
      onMouseEnter={hoverEnabled ? onHoverStart : undefined}
      onMouseLeave={hoverEnabled ? onHoverEnd : undefined}
    >
      <ColorSwatch color={colorStr} size={12} withShadow={false} />
      <Text>{label}</Text>
    </UnstyledButton>
  );
}
