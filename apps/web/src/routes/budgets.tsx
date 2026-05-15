import { BudgetHistoryChart } from "@/features/budgets/budget-history-chart";
import { BudgetsChart } from "@/features/budgets/budgets-chart";
import { localDateKey } from "@/lib/dates";
import { getBudgetHistory, getBudgetSnapshot } from "@/lib/endpoints";

import type { BudgetHistoryResponse } from "@fin/schemas";
import { Anchor, Card, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";

/**
 * Budgets page. Two modes via the `budgetId` search param:
 *
 *   - Snapshot list (default): every active budget rendered as a
 *     progress-bar row, grouped by currency.
 *   - Drill-down (when `budgetId` is set): one budget's last 12
 *     cycles as a bar chart with a current-budget reference line.
 *
 * "Today" comes from the client because cycle boundaries depend on
 * the user's local timezone — server math is in UTC, so we send the
 * already-resolved local date string.
 */
export function BudgetsRoute() {
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => localDateKey(new Date()), []);
  const budgetId = params.get("budgetId");

  return (
    <>
      {budgetId ? (
        <DrillView
          budgetId={budgetId}
          today={today}
          onBack={() => {
            setParams((p) => {
              const next = new URLSearchParams(p);
              next.delete("budgetId");
              return next;
            });
          }}
        />
      ) : (
        <SnapshotView
          today={today}
          onSelect={(id) => {
            setParams((p) => {
              const next = new URLSearchParams(p);
              next.set("budgetId", id);
              return next;
            });
          }}
        />
      )}
    </>
  );
}

function SnapshotView({
  today,
  onSelect,
}: {
  today: string;
  onSelect: (id: string) => void;
}) {
  const q = useQuery({
    queryKey: ["budget-snapshot", today],
    queryFn: () => getBudgetSnapshot(today),
  });
  if (q.isLoading) return <Text c="dimmed">Loading…</Text>;
  if (q.error)
    return <Text c="red">Failed to load: {(q.error as Error).message}</Text>;
  const snapshots = q.data ?? [];
  if (snapshots.length === 0) {
    return (
      <Card>
        <Text c="dimmed">
          No budgets yet. Add one under{" "}
          <Anchor component="a" href="/settings/budgets">
            Settings › Budgets
          </Anchor>
          .
        </Text>
      </Card>
    );
  }
  return (
    <BudgetsChart snapshots={snapshots} today={today} onSelect={onSelect} />
  );
}

function DrillView({
  budgetId,
  today,
  onBack,
}: {
  budgetId: string;
  today: string;
  onBack: () => void;
}) {
  const q = useQuery({
    queryKey: ["budget-history", budgetId, today],
    queryFn: () => getBudgetHistory(budgetId, today),
  });
  return (
    <Stack>
      <Anchor onClick={onBack}>
        <ChevronLeft size={14} style={{ verticalAlign: "middle" }} /> All
        budgets
      </Anchor>
      {q.isLoading ? (
        <Text c="dimmed">Loading…</Text>
      ) : q.error ? (
        <Text c="red">Failed to load: {(q.error as Error).message}</Text>
      ) : q.data ? (
        <Card>
          <BudgetHistoryChart history={q.data} label={drillLabel(q.data)} />
        </Card>
      ) : null}
    </Stack>
  );
}

function drillLabel(h: BudgetHistoryResponse): string {
  // The history payload only carries ids, not names. For now we just
  // show "Budget history" — when we have a categories cache in the
  // page we can resolve names here. Acceptable for v1.
  void h;
  return "Budget history";
}
