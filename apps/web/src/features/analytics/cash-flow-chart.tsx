import { getCashFlow, listAccountGroups } from "@/lib/endpoints";

import type { Granularity } from "@fin/schemas";
import {
  Card,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  appendSegment,
  type ChartState,
  crumbLabel,
  type Direction,
  DIRECTION_LABEL,
  displayItemName,
  type DrillSegment,
  interpretItem,
  isLeaf,
  popToDepth,
  stateToQuery,
  withDirection,
} from "./cash-flow-state";
import { ChartTitle } from "./chart-title";
import { DivergingNetChart } from "./diverging-net-chart";
import { DrillBreadcrumb } from "./drill-breadcrumb";
import { DrillPicker } from "./drill-picker";
import { SortedBarChart } from "./sorted-bar-chart";
import { useCurrencyFormatters } from "./use-currency-formatters";

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: "out", label: DIRECTION_LABEL.out },
  { value: "in", label: DIRECTION_LABEL.in },
  { value: "net", label: DIRECTION_LABEL.net },
];

const ALL_GROUPS = "__all__";

export function CashFlowChart({
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
  const [state, setState] = useState<ChartState>({
    direction: "out",
    drill: [],
  });
  const [accountGroupId, setAccountGroupId] = useState<string>(ALL_GROUPS);
  const activeAccountGroupId =
    accountGroupId === ALL_GROUPS ? undefined : accountGroupId;

  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const groups = groupsQ.data ?? [];

  const query = useMemo(
    () =>
      stateToQuery(state, {
        granularity,
        start,
        end,
        currency,
        accountGroupId: activeAccountGroupId,
      }),
    [state, granularity, start, end, currency, activeAccountGroupId],
  );

  const q = useQuery({
    queryKey: ["cash-flow", query],
    queryFn: () => getCashFlow(query),
    enabled: !!currency,
  });

  const items = q.data?.items ?? [];
  const buckets = q.data?.buckets ?? [];

  // Bucket ids on the wire are either UUIDs or short enum strings —
  // either way, suitable as a data-row key. Null ids ("Other"
  // synthetic bucket) get a sentinel so the row stays addressable.
  // SortedBarChart re-orders the series for stacking and assigns
  // palette colors by rank; we just need each entry to have a stable
  // name/label.
  const series = items.map((item) => ({
    name: String(item.id ?? "__other__"),
    label: displayItemName(state, item),
  }));

  const fmt = useCurrencyFormatters(currency);

  return (
    <Card>
      <Stack>
        <Group justify="space-between">
          <ChartTitle
            info="How much cash is going in and out of your everyday accounts each period — checking, savings, and credit cards. Loan payments count as cash out (real cash leaves your account, even though they're recorded as transfers), but purchases charged directly to a loan account (e.g., BNPL) don't — that's debt incurred, not cash leaving, and surfaces here only when you actually pay the loan. Useful for: do I have enough cushion this month? Could I afford another $X recurring payment?"
            title="Cashflow"
          />
          <Group>
            <SegmentedControl
              data={DIRECTION_OPTIONS}
              value={state.direction}
              onChange={(v) =>
                setState((s) => withDirection(s, v as Direction))
              }
            />
            {groups.length > 0 && (
              <Select
                aria-label="Account group"
                data={[
                  { value: ALL_GROUPS, label: "All account groups" },
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                ]}
                value={accountGroupId}
                onChange={(v) => v && setAccountGroupId(v)}
              />
            )}
          </Group>
        </Group>
        <Group>
          {state.direction !== "net" && (
            <DrillBreadcrumb
              labels={state.drill.map(crumbLabel)}
              onPopTo={(depth) => setState((s) => popToDepth(s, depth))}
            />
          )}
          {!isLeaf(state) &&
            (() => {
              // Pair each drillable item with the segment it produces;
              // non-drillable items (null id, or item kind unrecognized
              // at this level) drop out.
              const drillable = items
                .map((item) => {
                  const seg = interpretItem(state, item);
                  if (!seg) return null;
                  return {
                    id: String(item.id),
                    label: displayItemName(state, item),
                    seg,
                  };
                })
                .filter(
                  (x): x is { id: string; label: string; seg: DrillSegment } =>
                    x !== null,
                );
              return (
                <DrillPicker
                  options={drillable.map((d) => ({ id: d.id, label: d.label }))}
                  onPick={(id) => {
                    const hit = drillable.find((d) => d.id === id);
                    if (hit) setState((s) => appendSegment(s, hit.seg));
                  }}
                />
              );
            })()}
        </Group>
        {q.isLoading ? (
          <Text c="dimmed">Loading…</Text>
        ) : q.error ? (
          <Text c="red">Failed to load: {(q.error as Error).message}</Text>
        ) : buckets.length === 0 ? (
          <Text c="dimmed">No data for this view.</Text>
        ) : state.direction === "net" ? (
          // Net direction returns three server-side series — `in`,
          // `out`, `net` — that fit DivergingNetChart's positive /
          // negative / net contract exactly. The other directions
          // remain stacked-area territory.
          <DivergingNetChart
            data={buckets}
            negative={{ name: "out", label: "Cash out" }}
            net={{ name: "net", label: "Net" }}
            positive={{ name: "in", label: "Cash in" }}
            valueFormatter={fmt?.tooltipFormatter}
            withPointLabels={withPointLabels}
            yAxisProps={fmt ? { tickFormatter: fmt.axisFormatter } : undefined}
          />
        ) : (
          <SortedBarChart
            data={buckets}
            dataKey="period"
            h={300}
            series={series}
            type="stacked"
            withLegend
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
