import type {
  CashFlowDirection,
  ChartBucket,
  ChartItem,
  Granularity,
} from "@fin/schemas";
import {
  Anchor,
  getThemeColor,
  Group,
  NativeSelect,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { StackedBarChart } from "@/features/analytics/chart-shared";
import { getCashFlow } from "@/lib/endpoints";

/**
 * Drill state — discriminated by the active direction. Each direction
 * has its own state machine:
 *
 *   - out: top (Expenses/Loans/Subs) → expenses → expensesByCategory,
 *          or top → loans / subs (leaves)
 *   - in:  top (categories) → byCategory (subcategories of one category)
 *   - net: single state, no drill
 *
 * Switching direction resets to that direction's top.
 */
type DrillState =
  | { direction: "out"; dimension: "outTop" }
  | { direction: "out"; dimension: "outExpenses" }
  | {
      direction: "out";
      dimension: "outExpensesByCategory";
      categoryId: string;
      categoryName: string;
    }
  | { direction: "out"; dimension: "outLoans" }
  | { direction: "out"; dimension: "outSubs" }
  | { direction: "in"; dimension: "inTop" }
  | {
      direction: "in";
      dimension: "inByCategory";
      categoryId: string;
      categoryName: string;
    }
  | { direction: "net"; dimension: "net" };

const DIRECTION_TITLES: Record<CashFlowDirection, string> = {
  out: "Cash out",
  in: "Cash in",
  net: "Net cash flow",
};

const OUT_DRILL_LABELS: Record<
  "outExpenses" | "outExpensesByCategory" | "outLoans" | "outSubs",
  string
> = {
  outExpenses: "Expenses",
  outExpensesByCategory: "Expenses",
  outLoans: "Loan payments",
  outSubs: "Subs",
};

const DIRECTION_OPTIONS = [
  { value: "out", label: "Cash out" },
  { value: "in", label: "Cash in" },
  { value: "net", label: "Net cash flow" },
];

function defaultDrill(direction: CashFlowDirection): DrillState {
  if (direction === "out") return { direction: "out", dimension: "outTop" };
  if (direction === "in") return { direction: "in", dimension: "inTop" };
  return { direction: "net", dimension: "net" };
}

export function CashFlowChart({
  granularity,
  start,
  end,
  currency,
}: {
  granularity: Granularity;
  start: string;
  end: string;
  currency: string;
}) {
  const [drill, setDrill] = useState<DrillState>(defaultDrill("out"));

  function drillInto(item: ChartItem) {
    if (!item.id) return;
    if (drill.dimension === "outTop") {
      if (item.id === "expense")
        setDrill({ direction: "out", dimension: "outExpenses" });
      else if (item.id === "loan")
        setDrill({ direction: "out", dimension: "outLoans" });
      else if (item.id === "sub")
        setDrill({ direction: "out", dimension: "outSubs" });
    } else if (drill.dimension === "outExpenses") {
      setDrill({
        direction: "out",
        dimension: "outExpensesByCategory",
        categoryId: item.id,
        categoryName: item.name,
      });
    } else if (drill.dimension === "inTop") {
      setDrill({
        direction: "in",
        dimension: "inByCategory",
        categoryId: item.id,
        categoryName: item.name,
      });
    }
    // Other dimensions are leaves — no further drill.
  }
  const resetToDirectionTop = () => setDrill(defaultDrill(drill.direction));
  const upToExpenses = () =>
    setDrill({ direction: "out", dimension: "outExpenses" });
  const onDirectionChange = (next: CashFlowDirection) =>
    setDrill(defaultDrill(next));

  const categoryId =
    drill.dimension === "outExpensesByCategory" ||
    drill.dimension === "inByCategory"
      ? drill.categoryId
      : undefined;

  const q = useQuery({
    queryKey: [
      "analytics",
      "cash-flow",
      {
        granularity,
        start,
        end,
        currency,
        dimension: drill.dimension,
        categoryId: categoryId ?? null,
      },
    ],
    queryFn: () =>
      getCashFlow({
        granularity,
        start,
        end,
        currency,
        dimension: drill.dimension,
        categoryId,
      }),
    enabled: !!currency,
  });

  // Click-to-drill is enabled at any non-leaf level: outTop (into a
  // bucket), outExpenses (into a category), inTop (into a category).
  const canDrill =
    drill.dimension === "outTop" ||
    drill.dimension === "outExpenses" ||
    drill.dimension === "inTop";

  const isAtTop =
    drill.dimension === "outTop" ||
    drill.dimension === "inTop" ||
    drill.dimension === "net";

  return (
    <Stack>
      <Group gap="xs" justify="space-between">
        <Group gap="xs">
          <Anchor
            c="inherit"
            component="button"
            type="button"
            onClick={resetToDirectionTop}
          >
            <Title order={4}>{DIRECTION_TITLES[drill.direction]}</Title>
          </Anchor>
          {drill.direction === "out" && drill.dimension !== "outTop" && (
            <>
              <Text c="dimmed">›</Text>
              {drill.dimension === "outExpensesByCategory" ? (
                // Expenses level is clickable as a partial reset; the
                // leaf (categoryName) is not.
                <Anchor
                  c="inherit"
                  component="button"
                  type="button"
                  onClick={upToExpenses}
                >
                  <Title order={4}>Expenses</Title>
                </Anchor>
              ) : (
                <Title order={4}>{OUT_DRILL_LABELS[drill.dimension]}</Title>
              )}
              {drill.dimension === "outExpensesByCategory" && (
                <>
                  <Text c="dimmed">›</Text>
                  <Title order={4}>{drill.categoryName}</Title>
                </>
              )}
            </>
          )}
          {drill.direction === "in" && drill.dimension === "inByCategory" && (
            <>
              <Text c="dimmed">›</Text>
              <Title order={4}>{drill.categoryName}</Title>
            </>
          )}
        </Group>
        {isAtTop && (
          <NativeSelect
            aria-label="Cash-flow direction"
            data={DIRECTION_OPTIONS}
            value={drill.direction}
            onChange={(e) =>
              onDirectionChange(e.target.value as CashFlowDirection)
            }
          />
        )}
      </Group>
      {q.isLoading && (
        <Text c="dimmed" size="sm">
          Loading…
        </Text>
      )}
      {q.error && (
        <Text c="red" size="sm">
          {(q.error as Error).message}
        </Text>
      )}
      {q.data &&
        (drill.direction === "net" ? (
          <NetCashFlowChartView
            buckets={q.data.buckets}
            currency={q.data.currency}
          />
        ) : (
          <StackedBarChart
            buckets={q.data.buckets}
            currency={q.data.currency}
            emptyMessage={
              drill.direction === "in"
                ? "No income in this period."
                : "No cash out in this period."
            }
            items={q.data.items}
            onDrill={canDrill ? drillInto : undefined}
          />
        ))}
    </Stack>
  );
}

/**
 * Diverging-bar + net-line view used for direction="net". Shows two
 * stacked bars per period — Cash in (green, positive, above zero) and
 * Cash out (red, negative, below zero) — plus a Net line whose dots
 * are colored conditionally (green when positive, red when negative).
 *
 * Built directly on Recharts' `ComposedChart` because Mantine's
 * `BarChart` wrapper doesn't support a Line series alongside Bars.
 * `stackOffset="sign"` is what splits the stacked bars across the zero
 * baseline — without it Recharts would just stack arithmetically.
 */
function NetCashFlowChartView({
  buckets,
  currency,
}: {
  buckets: ChartBucket[];
  currency: string;
}) {
  const theme = useMantineTheme();
  // Match the existing stacked-bar chart palette (teal.6 + red.6) so
  // the net view feels like part of the same chart family rather than
  // a stoplight.
  const inColor = getThemeColor("teal.6", theme);
  const outColor = getThemeColor("red.6", theme);

  if (buckets.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No cash flow in this period.
      </Text>
    );
  }

  const data = buckets.map((b) => {
    const cashIn = Number(b.in) || 0;
    const cashOut = Number(b.out) || 0;
    return {
      period: b.period,
      in: cashIn,
      out: cashOut,
      net: cashIn + cashOut,
    };
  });

  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  });

  return (
    <ResponsiveContainer height={400} width="100%">
      <ComposedChart data={data} stackOffset="sign">
        <CartesianGrid
          stroke="var(--chart-grid-color, var(--mantine-color-gray-3))"
          strokeDasharray="3 3"
        />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(v: number) => fmt.format(v)}
          width={80}
        />
        <Tooltip
          contentStyle={{
            background: "var(--mantine-color-body)",
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: 4,
          }}
          formatter={(value) => fmt.format(Number(value))}
        />
        <Legend />
        <Bar dataKey="in" fill={inColor} name="Cash in" stackId="cashflow" />
        <Bar dataKey="out" fill={outColor} name="Cash out" stackId="cashflow" />
        <Line
          dataKey="net"
          // The line itself is neutral; per-point dots carry the
          // positive/negative signal via fill color. Recharts types
          // the dot callback's `key` as React.Key (which includes
          // null) — we forward it as-is to the SVG element.
          dot={(props) => {
            const { cx, cy, payload, key } = props as {
              cx?: number;
              cy?: number;
              payload?: { net: number };
              key?: React.Key | null;
            };
            const fill = (payload?.net ?? 0) >= 0 ? inColor : outColor;
            return (
              <circle
                key={key}
                cx={cx}
                cy={cy}
                fill={fill}
                r={5}
                stroke="var(--mantine-color-body)"
                strokeWidth={1.5}
              />
            );
          }}
          isAnimationActive={false}
          name="Net"
          stroke={getThemeColor("dark.4", theme)}
          strokeWidth={2}
          type="linear"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
