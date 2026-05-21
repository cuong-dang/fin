import { getCategoryTag, listTags } from "@/lib/endpoints";

import type { CategoryChartDirection, Granularity, Tag } from "@fin/schemas";
import {
  Card,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ChartTitle } from "./chart-title";
import { DrillBreadcrumb } from "./drill-breadcrumb";
import { DrillPicker } from "./drill-picker";
import { SortedBarChart } from "./sorted-bar-chart";
import { useCurrencyFormatters } from "./use-currency-formatters";

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
 * (toolbar + breadcrumb + picker over a SortedBarChart), with two
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
  withPointLabels,
}: {
  granularity: Granularity;
  start: string;
  end: string;
  currency: string;
  withPointLabels: boolean;
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
  // SortedBarChart re-orders the series for stacking and assigns
  // palette colors by rank; we just need each entry to have a stable
  // name/label.
  const series = items.map((item) => ({
    name: String(item.id ?? "__other__"),
    label: item.name,
  }));

  const fmt = useCurrencyFormatters(currency);

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
          <ChartTitle
            info="Where your money goes (or comes from), broken down by category — including big-ticket items financed by loans, counted on the day you bought them. Filter by a tag to narrow further. Useful for: what am I actually spending on? Is any category creeping up?"
            title="By category & tag"
          />
          <Group>
            <SegmentedControl
              data={DIRECTION_OPTIONS}
              value={direction}
              onChange={(v) => onDirectionChange(v as CategoryChartDirection)}
            />
            <Select
              aria-label="Tag filter"
              // Only surface the clear (X) button when an actual
              // filter is set — clearing the default sentinel would
              // be a visible no-op.
              clearable={tag !== ALL_TAGS}
              data={tagOptions(tags)}
              value={tag}
              onChange={(v) => setTag(v ?? ALL_TAGS)}
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
          <SortedBarChart
            data={buckets}
            dataKey="period"
            h={300}
            series={series}
            withLegend
            withPointLabels={withPointLabels}
            {...(fmt && {
              valueFormatter: fmt.tooltipFormatter,
              yAxisProps: { tickFormatter: fmt.axisFormatter },
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
