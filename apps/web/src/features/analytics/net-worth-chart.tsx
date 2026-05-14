import { getNetWorth } from "@/lib/endpoints";

import type { Granularity } from "@fin/schemas";
import { Card, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { ChartTitle } from "./chart-title";
import { DivergingNetChart } from "./diverging-net-chart";
import { useCurrencyFormatters } from "./use-currency-formatters";

/**
 * Net-worth chart. Renders a diverging stacked area:
 *
 *   - `assets` stack above zero (positive values from the server)
 *   - `liabilities` stack below zero (the server signs them negative
 *     so debts naturally sit under the X axis)
 *   - `net` line traces assets + liabilities across the period
 *
 * Unlike the other two analytics charts, net-worth has only the
 * shared toolbar (granularity + currency) and no per-chart filters —
 * every bucket has a fixed shape, so there's nothing to drill or
 * scope.
 */
export function NetWorthChart({
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
  const q = useQuery({
    queryKey: ["net-worth", { granularity, start, end, currency }],
    queryFn: () => getNetWorth({ granularity, start, end, currency }),
    enabled: !!currency,
  });

  const buckets = q.data?.buckets ?? [];

  const fmt = useCurrencyFormatters(currency);

  return (
    <Card>
      <Stack>
        <ChartTitle
          info="Everything you own minus everything you owe, tracked over time. Assets sit above zero; debts (credit-card balances and loans) sit below zero; the net line is the difference. Useful for: am I building wealth?"
          title="Net worth"
        />
        {q.isLoading ? (
          <Text c="dimmed">Loading…</Text>
        ) : q.error ? (
          <Text c="red">Failed to load: {(q.error as Error).message}</Text>
        ) : buckets.length === 0 ? (
          <Text c="dimmed">No data for this view.</Text>
        ) : (
          <DivergingNetChart
            data={buckets}
            negative={{ name: "liabilities", label: "Liabilities" }}
            net={{ name: "net", label: "Net worth" }}
            positive={{ name: "assets", label: "Assets" }}
            valueFormatter={fmt?.tooltipFormatter}
            yAxisProps={fmt ? { tickFormatter: fmt.axisFormatter } : undefined}
          />
        )}
      </Stack>
    </Card>
  );
}
