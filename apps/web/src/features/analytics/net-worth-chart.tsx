import type { ChartBucket, Granularity } from "@fin/schemas";
import { Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { DivergingNetChart } from "@/features/analytics/diverging-net-chart";
import { getNetWorth } from "@/lib/endpoints";

/**
 * Net worth chart — diverging stacked-area + net-line. Assets render
 * above zero, Liabilities below (their sum is signed negative), and a
 * Net worth line tracks the running total. Mirrors Net cash flow's
 * shape; the `<DivergingNetChart>` primitive owns the rendering.
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
    queryKey: ["analytics", "net-worth", { granularity, start, end, currency }],
    queryFn: () => getNetWorth({ granularity, start, end, currency }),
    enabled: !!currency,
  });

  return (
    <Stack>
      <Title order={4}>Net worth</Title>
      {q.isLoading && <Text c="dimmed">Loading…</Text>}
      {q.error && <Text c="red">{(q.error as Error).message}</Text>}
      {q.data && (
        <NetWorthChartView
          buckets={q.data.buckets}
          currency={q.data.currency}
        />
      )}
    </Stack>
  );
}

function NetWorthChartView({
  buckets,
  currency,
}: {
  buckets: ChartBucket[];
  currency: string;
}) {
  const data = buckets.map((b) => {
    const assets = Number(b.assets) || 0;
    const liabilities = Number(b.liabilities) || 0;
    return {
      period: b.period,
      positive: assets,
      negative: liabilities,
      net: assets + liabilities,
    };
  });
  return (
    <DivergingNetChart
      currency={currency}
      data={data}
      kind="areas"
      negative={{ label: "Liabilities", color: "red.6" }}
      net={{ label: "Net worth", color: "dark.4" }}
      positive={{ label: "Assets", color: "teal.6" }}
    />
  );
}
