import { useCurrencyFormatters } from "@/features/analytics/use-currency-formatters";
import { currencyDivisor, formatMoney } from "@/lib/money";

import type { BudgetHistoryResponse } from "@fin/schemas";
import { BarChart } from "@mantine/charts";
import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { Info } from "lucide-react";
import { useMemo } from "react";

import { BUDGET_FREQUENCY_SHORT } from "./frequency-label";

/**
 * Per-budget history: bar chart of actuals across the last N cycles,
 * with a horizontal reference line at the budget's *current*
 * amount. We don't track historical budget changes in v1, so every
 * past bar is compared against today's amount — the chart caption
 * notes this explicitly.
 */
export function BudgetHistoryChart({
  history,
  label,
}: {
  history: BudgetHistoryResponse;
  label: string;
}) {
  const { budget, points } = history;
  const fmt = useCurrencyFormatters(budget.currency);
  const amount = Number(BigInt(budget.amount));
  const divisor = currencyDivisor(budget.currency);
  const amountMajor = amount / divisor;

  const data = useMemo(
    () =>
      points.map((p) => ({
        period: p.cycleStart, // YYYY-MM-DD of cycle start; concise & sortable
        actual: Number(BigInt(p.actual)) / divisor,
      })),
    [points, divisor],
  );

  // Pin the Y axis so the budget reference line is always visible.
  // Without this, Recharts auto-scales to the bar heights alone — for
  // cycles well under budget the line ends up clipped off the top of
  // the chart.
  const maxActual = data.reduce((m, d) => Math.max(m, d.actual), 0);
  const yMax = Math.max(amountMajor, maxActual);
  const yAxisProps = {
    domain: [0, yMax] as [number, number],
    ...(fmt && { tickFormatter: fmt.axisFormatter }),
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Group>
          <Text fw={500}>{label}</Text>
          <Tooltip
            label="Comparing each cycle's spend against the budget's current amount.
            We don't track historical budget changes yet — bars prior to your most
            recent edit still compare against today's cap."
            multiline
            w={300}
          >
            <Info color="var(--mantine-color-dimmed)" size={14} />
          </Tooltip>
        </Group>
        <Text c="dimmed" ff="monospace">
          {formatMoney(BigInt(budget.amount), budget.currency)}
          {BUDGET_FREQUENCY_SHORT[budget.frequency]}
        </Text>
      </Group>
      <BarChart
        data={data}
        dataKey="period"
        getBarColor={(v) => (v >= amountMajor ? "red.6" : "teal.6")}
        h={300}
        referenceLines={[
          {
            y: amountMajor,
            label: "Budget",
            color: "dark.6",
            labelPosition: "insideTopRight",
          },
        ]}
        series={[{ name: "actual", label: "Spent", color: "teal.6" }]}
        withBarValueLabel
        withTooltip
        yAxisProps={yAxisProps}
        {...(fmt && { valueFormatter: fmt.tooltipFormatter })}
      />
    </Stack>
  );
}
