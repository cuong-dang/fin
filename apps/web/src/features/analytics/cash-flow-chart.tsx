import type {
  AccountGroup,
  CashFlowDirection,
  ChartBucket,
  ChartItem,
  Granularity,
} from "@fin/schemas";
import { Anchor, Group, NativeSelect, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { StackedBarChart } from "@/features/analytics/chart-shared";
import { DivergingNetChart } from "@/features/analytics/diverging-net-chart";
import { getCashFlow, listAccountGroups } from "@/lib/endpoints";

/**
 * Drill state — discriminated by the active direction. Each direction
 * has its own state machine:
 *
 *   - out: top (Expenses/Loans/Bills) → expenses → expensesByCategory,
 *          or top → loans / bills (leaves)
 *   - in:  top (categories) → byCategory (subcategories of one category)
 *   - net: single state, no drill
 *
 * Switching direction resets to that direction's top.
 */
type DrillState =
  | { direction: "out"; dimension: "outTop" }
  | { direction: "out"; dimension: "outExpenses" }
  | {
      direction: "out";
      dimension: "outExpensesByCategory";
      categoryId: string;
      categoryName: string;
    }
  | { direction: "out"; dimension: "outLoans" }
  | { direction: "out"; dimension: "outBills" }
  | { direction: "in"; dimension: "inTop" }
  | {
      direction: "in";
      dimension: "inByCategory";
      categoryId: string;
      categoryName: string;
    }
  | { direction: "net"; dimension: "net" };

const DIRECTION_TITLES: Record<CashFlowDirection, string> = {
  out: "Cash out",
  in: "Cash in",
  net: "Net cash flow",
};

const OUT_DRILL_LABELS: Record<
  "outExpenses" | "outExpensesByCategory" | "outLoans" | "outBills",
  string
> = {
  outExpenses: "Expenses",
  outExpensesByCategory: "Expenses",
  outLoans: "Loans",
  outBills: "Bills",
};

const DIRECTION_OPTIONS = [
  { value: "out", label: "Cash out" },
  { value: "in", label: "Cash in" },
  { value: "net", label: "Net cash flow" },
];

function defaultDrill(direction: CashFlowDirection): DrillState {
  if (direction === "out") return { direction: "out", dimension: "outTop" };
  if (direction === "in") return { direction: "in", dimension: "inTop" };
  return { direction: "net", dimension: "net" };
}

function groupOptions(groups: AccountGroup[]) {
  return [
    { value: "", label: "All groups" },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ];
}

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
  const [drill, setDrill] = useState<DrillState>(defaultDrill("out"));

  function drillInto(item: ChartItem) {
    if (!item.id) return;
    if (drill.dimension === "outTop") {
      if (item.id === "expense")
        setDrill({ direction: "out", dimension: "outExpenses" });
      else if (item.id === "loan")
        setDrill({ direction: "out", dimension: "outLoans" });
      else if (item.id === "bill")
        setDrill({ direction: "out", dimension: "outBills" });
    } else if (drill.dimension === "outExpenses") {
      setDrill({
        direction: "out",
        dimension: "outExpensesByCategory",
        categoryId: item.id,
        categoryName: item.name,
      });
    } else if (drill.dimension === "inTop") {
      setDrill({
        direction: "in",
        dimension: "inByCategory",
        categoryId: item.id,
        categoryName: item.name,
      });
    }
    // Other dimensions are leaves — no further drill.
  }

  const resetToDirectionTop = () => setDrill(defaultDrill(drill.direction));
  const upToExpenses = () =>
    setDrill({ direction: "out", dimension: "outExpenses" });
  const onDirectionChange = (next: CashFlowDirection) =>
    setDrill(defaultDrill(next));

  const categoryId =
    drill.dimension === "outExpensesByCategory" ||
    drill.dimension === "inByCategory"
      ? drill.categoryId
      : undefined;

  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const groups = groupsQ.data ?? [];
  const [groupId, setGroupId] = useState("");

  const q = useQuery({
    queryKey: [
      "analytics",
      "cash-flow",
      {
        granularity,
        start,
        end,
        currency,
        dimension: drill.dimension,
        groupId: groupId || null,
        categoryId: categoryId ?? null,
      },
    ],
    queryFn: () =>
      getCashFlow({
        granularity,
        start,
        end,
        currency,
        dimension: drill.dimension,
        groupId,
        categoryId,
      }),
    enabled: !!currency,
  });

  // Click-to-drill is enabled at any non-leaf level: outTop (into a
  // bucket), outExpenses (into a category), inTop (into a category).
  const canDrill =
    drill.dimension === "outTop" ||
    drill.dimension === "outExpenses" ||
    drill.dimension === "inTop";

  const isAtTop =
    drill.dimension === "outTop" ||
    drill.dimension === "inTop" ||
    drill.dimension === "net";

  return (
    <Stack>
      <Group justify="space-between">
        <Group>
          <Anchor
            c="inherit"
            component="button"
            type="button"
            onClick={resetToDirectionTop}
          >
            <Title order={4}>{DIRECTION_TITLES[drill.direction]}</Title>
          </Anchor>
          {drill.direction === "out" && drill.dimension !== "outTop" && (
            <>
              <Text c="dimmed">›</Text>
              {drill.dimension === "outExpensesByCategory" ? (
                // Expenses level is clickable as a partial reset; the
                // leaf (categoryName) is not.
                <Anchor
                  c="inherit"
                  component="button"
                  type="button"
                  onClick={upToExpenses}
                >
                  <Title order={4}>Expenses</Title>
                </Anchor>
              ) : (
                <Title order={4}>{OUT_DRILL_LABELS[drill.dimension]}</Title>
              )}
              {drill.dimension === "outExpensesByCategory" && (
                <>
                  <Text c="dimmed">›</Text>
                  <Title order={4}>{drill.categoryName}</Title>
                </>
              )}
            </>
          )}
          {drill.direction === "in" && drill.dimension === "inByCategory" && (
            <>
              <Text c="dimmed">›</Text>
              <Title order={4}>{drill.categoryName}</Title>
            </>
          )}
        </Group>
        {isAtTop ? (
          <Group>
            <NativeSelect
              aria-label="Cash-flow direction"
              data={DIRECTION_OPTIONS}
              value={drill.direction}
              onChange={(e) =>
                onDirectionChange(e.target.value as CashFlowDirection)
              }
            />
            <NativeSelect
              aria-label="Account group"
              data={groupOptions(groups)}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
          </Group>
        ) : (
          <Group>
            <NativeSelect
              aria-label="Cash-flow direction"
              data={DIRECTION_OPTIONS}
              disabled={true}
              value={drill.direction}
            />
            <NativeSelect
              aria-label="Account group"
              data={groupOptions(groups)}
              disabled={true}
              value={groupId}
            />
          </Group>
        )}
      </Group>
      {(q.isLoading || groupsQ.isLoading) && <Text c="dimmed">Loading…</Text>}
      {(q.error || groupsQ.error) && <Text c="red">Error loading.</Text>}
      {q.data &&
        (drill.direction === "net" ? (
          <NetCashFlowChartView
            buckets={q.data.buckets}
            currency={q.data.currency}
          />
        ) : (
          <StackedBarChart
            buckets={q.data.buckets}
            currency={q.data.currency}
            emptyMessage={
              drill.direction === "in"
                ? "No income in this period."
                : "No cash out in this period."
            }
            items={q.data.items}
            onDrill={canDrill ? drillInto : undefined}
          />
        ))}
    </Stack>
  );
}

/**
 * Net cash-flow view: diverging Cash in / Cash out bars per period
 * (positive above zero, negative below) plus a Net line tracking the
 * signed total. Same visual family as the net-worth chart; the
 * `<DivergingNetChart>` primitive owns the rendering.
 */
function NetCashFlowChartView({
  buckets,
  currency,
}: {
  buckets: ChartBucket[];
  currency: string;
}) {
  const data = buckets.map((b) => {
    const cashIn = Number(b.in) || 0;
    const cashOut = Number(b.out) || 0;
    return {
      period: b.period,
      positive: cashIn,
      negative: cashOut,
      net: cashIn + cashOut,
    };
  });
  return (
    <DivergingNetChart
      currency={currency}
      data={data}
      emptyMessage="No cash flow in this period."
      kind="bars"
      negative={{ label: "Cash out", color: "red.6" }}
      net={{ label: "Net", color: "dark.4" }}
      positive={{ label: "Cash in", color: "teal.6" }}
    />
  );
}
