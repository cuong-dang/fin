import { ChartTitle } from "@/features/analytics/chart-title";
import { BudgetHistoryChart } from "@/features/budgets/budget-history-chart";
import { BudgetsChart } from "@/features/budgets/budgets-chart";
import { localDateKey } from "@/lib/dates";
import { getBudgetHistory, getBudgetSnapshot } from "@/lib/endpoints";

import type { BudgetSnapshot } from "@fin/schemas";
import { Card, Group, Select, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "react-router";

/**
 * Budgets page. Two modes via the `budgetId` search param:
 *
 *   - Snapshot list (default): every active budget rendered as a
 *     progress-bar row, grouped by currency.
 *   - History (when `budgetId` is set): one budget's last 12 cycles
 *     as a bar chart with a current-budget reference line.
 *
 * The header (title + budget picker) is constant across both modes —
 * the picker doubles as both "view history of X" and (when cleared)
 * "back to all budgets," matching how the other analytics charts
 * expose a single filter / picker next to the title.
 *
 * "Today" comes from the client because cycle boundaries depend on
 * the user's local timezone — server math is in UTC, so we send the
 * already-resolved local date string.
 */
export function BudgetsRoute() {
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => localDateKey(new Date()), []);
  const budgetId = params.get("budgetId");

  // Snapshot powers both the default view AND the picker's option
  // list (only real DB-row budgets are pickable — synthetic parent
  // rollups have `id: null`). Fetching it at the route level avoids
  // double-fetching when switching between modes.
  const snapshotQ = useQuery({
    queryKey: ["budget-snapshot", today],
    queryFn: () => getBudgetSnapshot(today),
  });
  const snapshots = snapshotQ.data ?? [];
  const selectOptions = snapshots
    .filter((s): s is BudgetSnapshot & { id: string } => s.id !== null)
    .map((s) => ({ value: s.id, label: budgetLabel(s) }));

  const onBudgetChange = (next: string | null) => {
    setParams((p) => {
      const params = new URLSearchParams(p);
      if (next) params.set("budgetId", next);
      else params.delete("budgetId");
      return params;
    });
  };

  return (
    <Stack p="xs">
      <Group justify="space-between">
        <ChartTitle
          info="A snapshot of every active budget against this cycle's spend.
          Pick a budget on the right to see its last 12 cycles."
          title="Budgets"
        />
        <Select
          aria-label="Budget history"
          clearable
          data={selectOptions}
          placeholder="View history of…"
          searchable
          value={budgetId}
          onChange={onBudgetChange}
        />
      </Group>

      {budgetId ? (
        <DrillView
          budgetId={budgetId}
          // Look up the snapshot for the selected id so the history
          // chart can show the same "Food › Eating Out" label users
          // see in the snapshot view. Falls back to a generic label
          // if the snapshot list hasn't loaded yet or the budget was
          // deleted out from under a stale URL.
          label={
            snapshots.filter((s) => s.id === budgetId).map(budgetLabel)[0] ??
            "Budget history"
          }
          today={today}
        />
      ) : (
        <SnapshotView
          error={snapshotQ.error}
          isLoading={snapshotQ.isLoading}
          snapshots={snapshots}
          today={today}
        />
      )}
    </Stack>
  );
}

function SnapshotView({
  snapshots,
  today,
  isLoading,
  error,
}: {
  snapshots: BudgetSnapshot[];
  today: string;
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) return <Text c="dimmed">Loading…</Text>;
  if (error)
    return <Text c="red">Failed to load: {(error as Error).message}</Text>;
  if (snapshots.length === 0) {
    return (
      <Text c="dimmed" ta="center">
        No budgets yet.
      </Text>
    );
  }
  return <BudgetsChart snapshots={snapshots} today={today} />;
}

function DrillView({
  budgetId,
  today,
  label,
}: {
  budgetId: string;
  today: string;
  label: string;
}) {
  const q = useQuery({
    queryKey: ["budget-history", budgetId, today],
    queryFn: () => getBudgetHistory(budgetId, today),
  });
  if (q.isLoading) return <Text c="dimmed">Loading…</Text>;
  if (q.error)
    return <Text c="red">Failed to load: {(q.error as Error).message}</Text>;
  if (!q.data) return null;
  return (
    <Card>
      <BudgetHistoryChart history={q.data} label={label} />
    </Card>
  );
}

function budgetLabel(s: BudgetSnapshot): string {
  const base = s.subcategoryName
    ? `${s.categoryName} › ${s.subcategoryName}`
    : s.categoryName;
  return s.parentRollup ? `${base} (rollup)` : base;
}
