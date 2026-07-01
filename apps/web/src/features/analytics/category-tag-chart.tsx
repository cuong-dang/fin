import { MultiSelectChecklist } from "@/components/multi-select-checklist";
import { getCategoryTag, listTags } from "@/lib/endpoints";

import type { CategoryChartDirection, Granularity } from "@fin/schemas";
import { Card, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ChartTitle } from "./chart-title";
import { DrillBreadcrumb } from "./drill-breadcrumb";
import { DrillPicker } from "./drill-picker";
import { SortedBarChart } from "./sorted-bar-chart";
import { useCurrencyFormatters } from "./use-currency-formatters";

const DIRECTION_OPTIONS: { value: CategoryChartDirection; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

// Client-side sentinel matching the server's "untagged" filter — a
// virtual tag that, when present in the selection, includes lines
// with no tags alongside any concrete tags also selected.
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
  const [drill, setDrill] = useState<DrillSeg[]>([]);

  // Tag list scoped by direction — only tags that have been used on
  // lines of the current kind show up. Switching direction triggers
  // a refetch via the queryKey.
  const tagsQ = useQuery({
    queryKey: ["tags", direction],
    queryFn: () => listTags(direction),
  });
  const tags = useMemo(() => tagsQ.data ?? [], [tagsQ.data]);

  // Multi-select for the tag filter. `null` = uninitialized (use all
  // tags including untagged, no filter sent to server); a string[] =
  // explicit user selection (`UNTAGGED` as a member is valid and
  // matches lines with no tags). Empty array = "show none".
  const [selectedTagIds, setSelectedTagIds] = useState<string[] | null>(null);
  const allTagIds = useMemo(() => [UNTAGGED, ...tags.map((t) => t.id)], [tags]);
  const tagIdsArg = useMemo(() => {
    if (selectedTagIds === null) return undefined;
    if (
      selectedTagIds.length === allTagIds.length &&
      selectedTagIds.every((id) => allTagIds.includes(id))
    )
      return undefined;
    return selectedTagIds;
  }, [selectedTagIds, allTagIds]);

  const categorySeg = drill.find((s) => s.kind === "category");
  const subcategorySeg = drill.find((s) => s.kind === "subcategory");

  // User explicitly emptied the multi-select → show nothing. Same
  // reasoning as `CashFlowChart`: empty array serializes to no query
  // param, which the server would misread as "no filter".
  const filterIsEmpty = selectedTagIds !== null && selectedTagIds.length === 0;

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
        tagIds: tagIdsArg ?? null,
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
        ...(tagIdsArg && { tagIds: tagIdsArg }),
      }),
    enabled: !!currency && !filterIsEmpty,
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
    // Reset to "all" since the new direction's tag list is different.
    setSelectedTagIds(null);
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
            <MultiSelectChecklist
              allLabel="All tags"
              ariaLabel="Tags"
              options={[
                { value: UNTAGGED, label: "Untagged" },
                ...tags.map((t) => ({ value: t.id, label: t.name })),
              ]}
              value={selectedTagIds}
              onChange={setSelectedTagIds}
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
            h={500}
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
