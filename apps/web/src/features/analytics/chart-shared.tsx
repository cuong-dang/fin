import type { ChartBucket, ChartItem } from "@fin/schemas";
import { BarChart } from "@mantine/charts";
import {
  ColorSwatch,
  getThemeColor,
  Group,
  Text,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useState } from "react";
import { useXAxisScale, useYAxisScale, ZIndexLayer } from "recharts";

/**
 * Mantine palette names. BarChart resolves these against the active
 * theme so dark/light mode adapts. Order chosen for visual contrast
 * between adjacent stacks.
 */
const PALETTE = [
  "blue.6",
  "teal.6",
  "orange.6",
  "violet.6",
  "pink.6",
  "lime.6",
  "cyan.6",
  "red.6",
  "yellow.6",
  "indigo.6",
];

const safeKey = (i: number) => `c${i}`;

/**
 * Stacked bar chart used by every analytics chart. Owns the bucket
 * remap to safe `c0`/`c1`/… keys (Mantine's chart legend mangles
 * dataKeys with dots, so we never pass user-provided strings as
 * dataKeys), the series build, the legend, the per-bar totals, and
 * the y-axis width. Caller passes already-fetched response data.
 *
 * `onDrill` is optional — when provided, legend chips with non-null
 * id render as clickable buttons. Charts that don't support drill
 * just omit it.
 */
export function StackedBarChart({
  items,
  buckets: rawBuckets,
  currency,
  onDrill,
  emptyMessage = "No data in this period.",
}: {
  items: ChartItem[];
  buckets: ChartBucket[];
  currency: string;
  onDrill?: (item: ChartItem) => void;
  emptyMessage?: string;
}) {
  // Hover state: which series (by safe key like "c0") is currently
  // highlighted via legend-chip hover. Drives bar dimming + per-segment
  // value labels. null = nothing highlighted (default render).
  const [hovered, setHovered] = useState<string | null>(null);

  if (rawBuckets.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {emptyMessage}
      </Text>
    );
  }
  const itemKey = (item: ChartItem) => item.id ?? "__none__";
  const series = items.map((item, i) => ({
    name: safeKey(i),
    label: item.name,
    color: PALETTE[i % PALETTE.length],
  }));
  const buckets = rawBuckets.map((b) => {
    const out: Record<string, number | string> = { period: b.period };
    items.forEach((item, i) => {
      out[safeKey(i)] = Number(b[itemKey(item)]) || 0;
    });
    return out;
  });
  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  });
  const totals = buckets.map((b) =>
    items.reduce((s, _, i) => s + (Number(b[safeKey(i)]) || 0), 0),
  );
  return (
    <>
      <CustomLegend
        hoveredKey={hovered}
        items={items}
        seriesKey={safeKey}
        onDrill={onDrill}
        onHover={setHovered}
      />
      <BarChart
        // Per-bar dimming: non-hovered series fade to 0.1 fillOpacity
        // (matches Mantine's default legend-hover behavior).
        barProps={(s) =>
          hovered === null || hovered === s.name
            ? { fillOpacity: 1 }
            : { fillOpacity: 0.1 }
        }
        data={buckets}
        dataKey="period"
        h={400}
        series={series}
        tooltipAnimationDuration={150}
        type="stacked"
        valueFormatter={(v) => fmt.format(v)}
        withLegend={false}
        // Default 60 px clips currency labels like "$2,000.00".
        yAxisProps={{ width: 80 }}
      >
        <ChartOverlay
          buckets={buckets}
          format={(n) => fmt.format(n)}
          hoveredKey={hovered}
          seriesNames={series.map((s) => s.name)}
          totals={totals}
        />
      </BarChart>
    </>
  );
}

/**
 * Custom legend used by every analytics chart. Mantine's built-in
 * legend mangles dataKeys with dots; we render our own so we can also
 * wire click-to-drill where it applies. When `onDrill` is provided,
 * items with non-null id render as buttons; everything else is inert.
 *
 * Hover events (`onHover`) drive the `hoveredKey` state in the parent
 * — non-hovered bars dim and the hovered series gets per-segment value
 * labels overlaid.
 */
function CustomLegend({
  items,
  seriesKey,
  hoveredKey,
  onDrill,
  onHover,
}: {
  items: ChartItem[];
  seriesKey: (i: number) => string;
  hoveredKey: string | null;
  onDrill?: (item: ChartItem) => void;
  onHover: (key: string | null) => void;
}) {
  const theme = useMantineTheme();
  return (
    <Group gap="md">
      {items.map((item, i) => {
        const key = seriesKey(i);
        const color = getThemeColor(PALETTE[i % PALETTE.length], theme);
        const drillable = !!onDrill && item.id !== null;
        const dimmed = hoveredKey !== null && hoveredKey !== key;
        const onMouseEnter = () => onHover(key);
        const onMouseLeave = () => onHover(null);
        const chip = (
          <Group gap="xs" style={{ opacity: dimmed ? 0.4 : 1 }} wrap="nowrap">
            <ColorSwatch color={color} size={12} withShadow={false} />
            <Text size="sm">{item.name}</Text>
          </Group>
        );
        return drillable ? (
          <UnstyledButton
            key={i}
            onClick={() => onDrill(item)}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            {chip}
          </UnstyledButton>
        ) : (
          <span key={i} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            {chip}
          </span>
        );
      })}
    </Group>
  );
}

/**
 * Single overlay component that renders both per-bar stack totals (above
 * each bar) and — while a legend chip is hovered — the hovered series's
 * value at the middle of its segment on each bar.
 *
 * Wrapped in a `ZIndexLayer` at Recharts' label tier (2000) so it
 * portals into a SVG group rendered after Bars (zIndex 300). Without
 * this, bar fills cover the segment-middle text — Recharts' z-ordering
 * is implemented via DOM portals, not source order.
 *
 * The hovered-segment y position is computed by walking the stack:
 * y_middle = yScale(sum(values_below) + value/2).
 */
function ChartOverlay({
  buckets,
  totals,
  seriesNames,
  hoveredKey,
  format,
}: {
  buckets: Record<string, number | string>[];
  totals: number[];
  seriesNames: string[];
  hoveredKey: string | null;
  format: (n: number) => string;
}) {
  const xScale = useXAxisScale() as
    | ((v: string, opts?: { position?: "start" | "middle" | "end" }) => number)
    | undefined;
  const yScale = useYAxisScale() as ((v: number) => number) | undefined;
  if (!xScale || !yScale) return null;
  const hoveredIdx = hoveredKey ? seriesNames.indexOf(hoveredKey) : -1;
  const showSegmentLabels = !!hoveredKey && hoveredIdx >= 0;
  return (
    <ZIndexLayer zIndex={2000}>
      <g style={{ pointerEvents: "none" }}>
        {buckets.map((b, i) => {
          const total = totals[i] ?? 0;
          if (total === 0) return null;
          const x = xScale(String(b.period), { position: "middle" });
          if (!Number.isFinite(x)) return null;
          const totalY = yScale(total);
          if (!Number.isFinite(totalY)) return null;
          // For positive totals, place the label above the bar's top
          // edge; for negative totals (net direction), place it below
          // the bar's bottom edge.
          const totalLabelY = total >= 0 ? totalY - 4 : totalY + 14;
          let segmentNode = null;
          if (showSegmentLabels) {
            const value = Number(b[hoveredKey!]) || 0;
            // Stacked positive segments: walk values_below and place
            // label at the segment's middle. Single-series net bars
            // can be negative too — value/2 stays at the visual middle
            // since yScale is monotonic.
            const below = seriesNames
              .slice(0, hoveredIdx)
              .reduce((s, k) => s + (Number(b[k]) || 0), 0);
            const middleVal = below + value / 2;
            const segmentY = yScale(middleVal);
            if (value !== 0 && Number.isFinite(segmentY)) {
              segmentNode = (
                <text
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={11}
                  fontWeight={500}
                  textAnchor="middle"
                  x={x}
                  y={segmentY}
                >
                  {format(value)}
                </text>
              );
            }
          }
          return (
            <g key={i}>
              <text
                fill="var(--chart-text-color, var(--mantine-color-dimmed))"
                fontSize={11}
                fontWeight={500}
                textAnchor="middle"
                x={x}
                y={totalLabelY}
              >
                {format(total)}
              </text>
              {segmentNode}
            </g>
          );
        })}
      </g>
    </ZIndexLayer>
  );
}
