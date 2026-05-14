import { getCategoryTag, listTags } from "@/lib/endpoints";

import type { CategoryChartDirection, Granularity, Tag } from "@fin/schemas";
import {
  Card,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DrillBreadcrumb } from "./drill-breadcrumb";
import { DrillPicker } from "./drill-picker";
import { PALETTE } from "./palette";
import { SortedAreaChart } from "./sorted-area-chart";

const DIRECTION_OPTIONS: { value: CategoryChartDirection; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

// Two client-only sentinels for the tag picker. `ALL_TAGS` means "no
// filter" and is omitted from the request; `UNTAGGED` matches the
// server's "__none__" sentinel for untagged-only.
const ALL_TAGS = "__all__";
const UNTAGGED = "__none__";

// Two drill levels, mirroring cash-flow's category branch: a
// category, then optionally one subcategory beneath it.
type DrillSeg =
  | { kind: "category"; id: string; label: string }
  | { kind: "subcategory"; id: string; label: string };

/**
 * "By category & tag" chart. Mirrors the cash-flow chart's shape
 * (toolbar + breadcrumb + picker over a SortedAreaChart), with two
 * top-level filters — direction (expense/income) and tag — plus a
 * two-level drill (category → subcategory) matching cash-flow's
 * category branch.
 *
 * Unlike cash-flow's `out` direction, this chart counts every
 * expense/income line wherever it originates, including loan-account
 * expenses (financed purchases) and bill-charged lines. The server's
 * by-category-&-tag query doesn't filter on `accounts.type` or
 * `bill_id`.
 */
export function CategoryTagChart({
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
  // ALL_TAGS / UNTAGGED / tag UUID. Translated to the wire format when
  // building the query (see `tagIdArg` below).
  const [tag, setTag] = useState<string>(ALL_TAGS);
  const [drill, setDrill] = useState<DrillSeg[]>([]);

  // Tag list scoped by direction — only tags that have been used on
  // lines of the current kind show up. Switching direction triggers
  // a refetch via the queryKey.
  const tagsQ = useQuery({
    queryKey: ["tags", direction],
    queryFn: () => listTags(direction),
  });
  const tags = tagsQ.data ?? [];

  const tagIdArg = tag === ALL_TAGS ? undefined : tag;
  const categorySeg = drill.find((s) => s.kind === "category");
  const subcategorySeg = drill.find((s) => s.kind === "subcategory");

  const q = useQuery({
    queryKey: [
      "category-tag",
      {
        granularity,
        start,
        end,
        currency,
        direction,
        categoryId: categorySeg?.id ?? null,
        subcategoryId: subcategorySeg?.id ?? null,
        tagId: tagIdArg ?? null,
      },
    ],
    queryFn: () =>
      getCategoryTag({
        granularity,
        start,
        end,
        currency,
        direction,
        ...(categorySeg && { categoryId: categorySeg.id }),
        ...(subcategorySeg && { subcategoryId: subcategorySeg.id }),
        ...(tagIdArg && { tagId: tagIdArg }),
      }),
    enabled: !!currency,
  });

  const items = q.data?.items ?? [];
  const buckets = q.data?.buckets ?? [];

  // Null ids ("Other" synthetic bucket — lines with no subcategory in
  // drill mode) get a sentinel so the row stays addressable.
  // SortedAreaChart re-orders the series for stacking; we just need
  // each entry to have a stable name/label/color.
  const series = items.map((item, i) => ({
    name: String(item.id ?? "__other__"),
    label: item.name,
    color: PALETTE[i % PALETTE.length],
  }));

  const formatter = useMemo(
    () =>
      currency
        ? new Intl.NumberFormat("en-US", { style: "currency", currency })
        : null,
    [currency],
  );

  // Direction change resets the drill (different categories per kind)
  // and the tag filter (a previously-selected tag may not appear in
  // the new direction's tag list — the picker would then render an
  // empty selection).
  const onDirectionChange = (next: CategoryChartDirection) => {
    setDirection(next);
    setDrill([]);
    setTag(ALL_TAGS);
  };

  // Drillable items by depth:
  //   depth 0 (top)            → drill into a category
  //   depth 1 (category drill) → drill into a subcategory (skip null
  //                              ids — "Other" isn't a drill target)
  //   depth 2 (subcategory)    → leaf, no further drill
  const drillable = (() => {
    if (drill.length === 0) {
      return items
        .filter((i): i is { id: string; name: string } => i.id !== null)
        .map((i) => ({ id: i.id, label: i.name, kind: "category" as const }));
    }
    if (drill.length === 1) {
      return items
        .filter((i): i is { id: string; name: string } => i.id !== null)
        .map((i) => ({
          id: i.id,
          label: i.name,
          kind: "subcategory" as const,
        }));
    }
    return [];
  })();

  return (
    <Card>
      <Stack>
        <Group justify="space-between">
          <Title order={4}>By category &amp; tag</Title>
          <Group>
            <SegmentedControl
              data={DIRECTION_OPTIONS}
              value={direction}
              w="fit-content"
              onChange={(v) => onDirectionChange(v as CategoryChartDirection)}
            />
            <Select
              allowDeselect={false}
              aria-label="Tag filter"
              data={tagOptions(tags)}
              value={tag}
              onChange={(v) => v && setTag(v)}
            />
          </Group>
        </Group>
        <Group>
          <DrillBreadcrumb
            labels={drill.map((s) => s.label)}
            onPopTo={(depth) => setDrill((d) => d.slice(0, depth))}
          />
          <DrillPicker
            options={drillable.map((d) => ({ id: d.id, label: d.label }))}
            onPick={(id) => {
              const hit = drillable.find((d) => d.id === id);
              if (hit) {
                setDrill((curr) => [
                  ...curr,
                  { kind: hit.kind, id: hit.id, label: hit.label },
                ]);
              }
            }}
          />
        </Group>
        {q.isLoading ? (
          <Text c="dimmed">Loading…</Text>
        ) : q.error ? (
          <Text c="red">Failed to load: {(q.error as Error).message}</Text>
        ) : buckets.length === 0 ? (
          <Text c="dimmed">No data for this view.</Text>
        ) : (
          <SortedAreaChart
            curveType="natural"
            data={buckets}
            dataKey="period"
            h={300}
            series={series}
            type="stacked"
            withLegend
            withPointLabels
            {...(formatter && {
              valueFormatter: (v: number) => formatter.format(v),
            })}
          />
        )}
      </Stack>
    </Card>
  );
}

function tagOptions(tags: Tag[]): { value: string; label: string }[] {
  return [
    { value: ALL_TAGS, label: "All tags" },
    { value: UNTAGGED, label: "Untagged" },
    ...tags.map((t) => ({ value: t.id, label: t.name })),
  ];
}
