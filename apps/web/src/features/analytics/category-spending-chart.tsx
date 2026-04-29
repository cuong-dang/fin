import type { ChartItem, Granularity } from "@fin/schemas";
import { Anchor, Group, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { StackedBarChart } from "@/features/analytics/chart-shared";
import { getCategorySpending } from "@/lib/endpoints";

export function CategorySpendingChart({
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
  // Single state object — id and name always change together (set on
  // click, cleared on reset), so a single useState is simpler than
  // keeping them in lockstep across two.
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);

  const q = useQuery({
    queryKey: [
      "analytics",
      "category-spending",
      { granularity, start, end, currency, categoryId: drill?.id ?? null },
    ],
    queryFn: () =>
      getCategorySpending({
        granularity,
        start,
        end,
        currency,
        categoryId: drill?.id,
      }),
    enabled: !!currency,
  });

  function drillInto(item: ChartItem) {
    if (!item.id) return;
    setDrill({ id: item.id, name: item.name });
  }
  const reset = () => setDrill(null);

  return (
    <Stack>
      <Group gap="xs">
        <Anchor c="inherit" component="button" type="button" onClick={reset}>
          <Title order={4}>Spending</Title>
        </Anchor>
        {drill && (
          <>
            <Text c="dimmed">›</Text>
            <Title order={4}>{drill.name}</Title>
          </>
        )}
      </Group>
      {q.isLoading && <Text c="dimmed">Loading…</Text>}
      {q.error && <Text c="red">{(q.error as Error).message}</Text>}
      {q.data && (
        <StackedBarChart
          buckets={q.data.buckets}
          currency={q.data.currency}
          emptyMessage="No transactions in this period."
          items={q.data.items}
          onDrill={drill === null ? drillInto : undefined}
        />
      )}
    </Stack>
  );
}
