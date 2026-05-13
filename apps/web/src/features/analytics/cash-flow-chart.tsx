import { getCashFlow, listAccountGroups } from "@/lib/endpoints";

import type { Granularity } from "@fin/schemas";
import { AreaChart } from "@mantine/charts";
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

import {
  appendSegment,
  type ChartState,
  type Direction,
  DIRECTION_LABEL,
  displayItemName,
  isLeaf,
  popToDepth,
  stateToQuery,
  withDirection,
} from "./cash-flow-state";
import { DrillBreadcrumb } from "./drill-breadcrumb";
import { DrillPicker } from "./drill-picker";

// Rainbow-ish qualitative palette, matching Mantine's chart examples.
// Series get colors by index; the chart cycles if items outnumber the
// list.
const PALETTE = [
  "indigo.6",
  "blue.6",
  "teal.6",
  "lime.6",
  "yellow.6",
  "orange.6",
  "red.6",
  "pink.6",
  "grape.6",
  "violet.6",
];

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
}: {
  granularity: Granularity;
  start: string;
  end: string;
  currency: string;
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

  const chartType: "default" | "stacked" | "split" =
    state.direction === "net"
      ? "split"
      : items.length <= 1
        ? "default"
        : "stacked";

  const series = items.map((item, i) => ({
    // Bucket ids on the wire are either UUIDs or short enum strings —
    // either way, suitable as a data-row key. Null ids ("Other"
    // synthetic bucket) get a sentinel so the row stays addressable.
    name: String(item.id ?? "__other__"),
    label: displayItemName(state, item),
    color: PALETTE[i % PALETTE.length],
  }));

  const formatter = useMemo(
    () =>
      currency
        ? new Intl.NumberFormat("en-US", { style: "currency", currency })
        : null,
    [currency],
  );

  return (
    <Card>
      <Stack>
        <Group justify="space-between">
          <Title order={4}>Cash flow</Title>
          <Group>
            <SegmentedControl
              data={DIRECTION_OPTIONS}
              value={state.direction}
              w="fit-content"
              onChange={(v) =>
                setState((s) => withDirection(s, v as Direction))
              }
            />
            {groups.length > 0 && (
              <Select
                allowDeselect={false}
                aria-label="Account group"
                data={[
                  { value: ALL_GROUPS, label: "All groups" },
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
              state={state}
              onPopTo={(depth) => setState((s) => popToDepth(s, depth))}
            />
          )}
          {!isLeaf(state) && (
            <DrillPicker
              items={items}
              state={state}
              onPick={(seg) => setState((s) => appendSegment(s, seg))}
            />
          )}
        </Group>
        {q.isLoading ? (
          <Text c="dimmed">Loading…</Text>
        ) : q.error ? (
          <Text c="red">Failed to load: {(q.error as Error).message}</Text>
        ) : buckets.length === 0 ? (
          <Text c="dimmed">No data for this view.</Text>
        ) : (
          <AreaChart
            curveType="natural"
            data={buckets}
            dataKey="period"
            h={300}
            series={series}
            type={chartType}
            withLegend
            withPointLabels
            {...(chartType === "split" && {
              splitColors: ["teal.6", "red.6"] as [string, string],
            })}
            {...(formatter && {
              valueFormatter: (v: number) => formatter.format(v),
            })}
          />
        )}
      </Stack>
    </Card>
  );
}
