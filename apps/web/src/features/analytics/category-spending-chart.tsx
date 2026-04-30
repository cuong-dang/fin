import type {
  CategoryChartDirection,
  ChartItem,
  Granularity,
  Tag,
} from "@fin/schemas";
import { Anchor, Group, NativeSelect, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { StackedBarChart } from "@/features/analytics/chart-shared";
import { getCategorySpending, listTags } from "@/lib/endpoints";

const DIRECTION_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

// "none" is the server-accepted sentinel for the untagged-only filter
// (matches `tagId: uuid | "none"` in the schema). The empty string is
// our client-only "no filter" value — left out of the request entirely.
const UNTAGGED = "none";
const ALL_TAGS = "";

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
  const [direction, setDirection] = useState<CategoryChartDirection>("expense");
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS);
  // Single state object — id and name always change together (set on
  // click, cleared on reset), so a single useState is simpler than
  // keeping them in lockstep across two.
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);

  // Tag list is direction-scoped — only tags that have been used on
  // at least one line of the current kind are surfaced (e.g., expense
  // tags don't appear in the picker while viewing income).
  const tagsQ = useQuery({
    queryKey: ["tags", direction],
    queryFn: () => listTags(direction),
  });

  const tagId =
    tagFilter === ALL_TAGS
      ? undefined
      : tagFilter === UNTAGGED
        ? "none"
        : tagFilter;

  const q = useQuery({
    queryKey: [
      "analytics",
      "category-spending",
      {
        granularity,
        start,
        end,
        currency,
        direction,
        categoryId: drill?.id ?? null,
        tagId: tagId ?? null,
      },
    ],
    queryFn: () =>
      getCategorySpending({
        granularity,
        start,
        end,
        currency,
        direction,
        categoryId: drill?.id,
        tagId,
      }),
    enabled: !!currency,
  });

  function drillInto(item: ChartItem) {
    if (!item.id) return;
    setDrill({ id: item.id, name: item.name });
  }
  const reset = () => setDrill(null);
  // Switching direction resets the drill — categories are kind-scoped,
  // so the previously-drilled category is meaningless under the new
  // direction. Same goes for the tag selection: the previously-chosen
  // tag may not be associated with any line of the new kind, so the
  // server would refuse it (or worse, return empty data without
  // surfacing the mismatch). Reset to "All tags". Tag-only changes
  // preserve drill (looking at the same category through a different
  // tag lens is a sensible flow).
  const onDirectionChange = (next: CategoryChartDirection) => {
    setDirection(next);
    setDrill(null);
    setTagFilter(ALL_TAGS);
  };

  return (
    <Stack>
      <Group gap="xs" justify="space-between">
        <Group gap="xs" p={0}>
          <Anchor c="inherit" component="button" type="button" onClick={reset}>
            <Title order={4}>By category &amp; tag</Title>
          </Anchor>
          {drill && (
            <>
              <Text c="dimmed">›</Text>
              <Title order={4}>{drill.name}</Title>
            </>
          )}
        </Group>
        {!drill && (
          <Group gap="xs">
            <NativeSelect
              aria-label="Direction"
              data={DIRECTION_OPTIONS}
              value={direction}
              onChange={(e) =>
                onDirectionChange(e.target.value as CategoryChartDirection)
              }
            />
            <NativeSelect
              aria-label="Tag filter"
              data={tagOptions(tagsQ.data ?? [])}
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
          </Group>
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

function tagOptions(tags: Tag[]): { value: string; label: string }[] {
  return [
    { value: ALL_TAGS, label: "All tags" },
    { value: UNTAGGED, label: "Untagged" },
    ...tags.map((t) => ({ value: t.id, label: t.name })),
  ];
}
