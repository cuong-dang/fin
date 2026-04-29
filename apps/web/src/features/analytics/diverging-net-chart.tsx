import { getThemeColor, Text, useMantineTheme } from "@mantine/core";
import { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ZIndexLayer,
} from "recharts";

import {
  CHART_GRID_STROKE,
  CHART_TOOLTIP_STYLE,
  ChartLegend,
  edgeAnchor,
  useChartScales,
} from "./chart-shared";

type SeriesKey = "positive" | "negative" | "net";

type DivergingNetDatum = {
  period: string;
  /** Above-zero series (e.g., assets, cash in). */
  positive: number;
  /** Below-zero series — already signed negative (e.g., liabilities, cash out). */
  negative: number;
  /** Net = positive + negative. Drawn as a Line over the stacked positive/negative. */
  net: number;
};

type Series = {
  label: string;
  /** Mantine color name (e.g., "teal.6") — resolved internally. */
  color: string;
};

/**
 * Diverging stacked + net-line chart shared between cash-flow's net
 * view and the net-worth chart.
 *
 *   - The positive/negative pair shares one stack with `stackOffset="sign"`
 *     so positive renders above zero and (signed-negative) negative
 *     renders below.
 *   - The Net line tracks the running total. Per-point dots are colored
 *     by sign — positive's color when ≥ 0, negative's when < 0.
 *   - Hover any legend chip to dim the others and surface per-period
 *     value labels for the hovered series.
 *
 * `kind` picks Bars (cash flow) vs Areas (net worth). Recharts' axes,
 * tooltip, legend, dot renderer, and value overlay are all identical
 * between the two — the chart-component swap is the only meaningful
 * difference.
 */
export function DivergingNetChart({
  data,
  currency,
  kind,
  positive,
  negative,
  net,
  emptyMessage = "No data in this period.",
}: {
  data: DivergingNetDatum[];
  currency: string;
  kind: "bars" | "areas";
  positive: Series;
  negative: Series;
  net: Series;
  emptyMessage?: string;
}) {
  const theme = useMantineTheme();
  const posColor = getThemeColor(positive.color, theme);
  const negColor = getThemeColor(negative.color, theme);
  const netColor = getThemeColor(net.color, theme);

  const [hovered, setHovered] = useState<SeriesKey | null>(null);

  if (data.length === 0) return <Text c="dimmed">{emptyMessage}</Text>;

  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  });
  // Solid (bar/line/dot) opacity for the dim/highlight effect.
  const opacityFor = (key: SeriesKey) =>
    hovered === null || hovered === key ? 1 : 0.1;
  // Areas use a lower base fillOpacity so positive/negative regions don't
  // obscure the net line and gridlines.
  const fillOpacityFor = (key: "positive" | "negative") => {
    if (kind === "bars") return opacityFor(key);
    return hovered === null || hovered === key ? 0.45 : 0.05;
  };

  const legendItems = [
    { key: "positive", label: positive.label, color: posColor },
    { key: "negative", label: negative.label, color: negColor },
    { key: "net", label: net.label, color: netColor },
  ];

  const stackId = "diverge";
  const positiveAndNegative =
    kind === "bars" ? (
      <>
        <Bar
          dataKey="positive"
          fill={posColor}
          fillOpacity={fillOpacityFor("positive")}
          name={positive.label}
          stackId={stackId}
        />
        <Bar
          dataKey="negative"
          fill={negColor}
          fillOpacity={fillOpacityFor("negative")}
          name={negative.label}
          stackId={stackId}
        />
      </>
    ) : (
      <>
        <Area
          dataKey="positive"
          fill={posColor}
          fillOpacity={fillOpacityFor("positive")}
          isAnimationActive={false}
          name={positive.label}
          stackId={stackId}
          stroke={posColor}
          strokeOpacity={opacityFor("positive")}
          type="linear"
        />
        <Area
          dataKey="negative"
          fill={negColor}
          fillOpacity={fillOpacityFor("negative")}
          isAnimationActive={false}
          name={negative.label}
          stackId={stackId}
          stroke={negColor}
          strokeOpacity={opacityFor("negative")}
          type="linear"
        />
      </>
    );

  return (
    <>
      <ChartLegend
        hoveredKey={hovered}
        items={legendItems}
        onHover={(k) => setHovered(k as SeriesKey | null)}
      />
      <ResponsiveContainer height={400} width="100%">
        <ComposedChart data={data} stackOffset="sign">
          <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v: number) => fmt.format(v)}
            width={80}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value) => fmt.format(Number(value))}
          />
          {positiveAndNegative}
          <Line
            dataKey="net"
            // Per-point dots colored by sign — positive's color when net
            // is ≥ 0, negative's when < 0.
            dot={(props) => {
              const { cx, cy, payload, key } = props as {
                cx?: number;
                cy?: number;
                payload?: { net: number };
                key?: React.Key | null;
              };
              const fill = (payload?.net ?? 0) >= 0 ? posColor : negColor;
              return (
                <circle
                  key={key}
                  cx={cx}
                  cy={cy}
                  fill={fill}
                  fillOpacity={opacityFor("net")}
                  r={5}
                  stroke="var(--mantine-color-body)"
                  strokeOpacity={opacityFor("net")}
                  strokeWidth={1.5}
                />
              );
            }}
            isAnimationActive={false}
            name={net.label}
            stroke={netColor}
            strokeOpacity={opacityFor("net")}
            strokeWidth={2}
            type="linear"
          />
          {hovered && (
            <DivergingValueOverlay
              data={data}
              format={(n) => fmt.format(n)}
              hoveredKey={hovered}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

/**
 * Renders value labels at each data point for the hovered series:
 *   - "positive" → mid-height of the (positive) segment
 *   - "negative" → mid-height of the (negative) segment
 *   - "net"      → just above the net-line dot
 *
 * White on segments (positive/negative) reads against bar fills and the
 * translucent area fills uniformly. The dimmed text color above the net
 * dot reads against the chart background.
 */
function DivergingValueOverlay({
  data,
  hoveredKey,
  format,
}: {
  data: DivergingNetDatum[];
  hoveredKey: SeriesKey;
  format: (n: number) => string;
}) {
  const { xScale, yScale } = useChartScales();
  if (!xScale || !yScale) return null;
  const fill =
    hoveredKey === "net"
      ? "var(--chart-text-color, var(--mantine-color-dimmed))"
      : "white";
  return (
    <ZIndexLayer zIndex={2000}>
      <g style={{ pointerEvents: "none" }}>
        {data.map((d, i) => {
          const x = xScale(d.period, { position: "middle" });
          if (!Number.isFinite(x)) return null;
          const value = d[hoveredKey];
          if (value === 0) return null;
          let y: number;
          if (hoveredKey === "net") {
            const dotY = yScale(value);
            if (!Number.isFinite(dotY)) return null;
            y = dotY - 10;
          } else {
            const midY = yScale(value / 2);
            if (!Number.isFinite(midY)) return null;
            y = midY;
          }
          return (
            <text
              key={d.period}
              dominantBaseline="middle"
              fill={fill}
              fontSize={11}
              fontWeight={500}
              textAnchor={edgeAnchor(i, data.length)}
              x={x}
              y={y}
            >
              {format(value)}
            </text>
          );
        })}
      </g>
    </ZIndexLayer>
  );
}
