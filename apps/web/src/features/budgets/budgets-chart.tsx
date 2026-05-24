import { ChartTitle } from "@/features/analytics/chart-title";
import { localDateKey } from "@/lib/dates";
import { getBudgetHistory, getBudgetSnapshot } from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";

import type { BudgetSnapshot, Granularity } from "@fin/schemas";
import {
  Box,
  Card,
  Group,
  Mark,
  Progress,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Sigma } from "lucide-react";
import { useMemo, useState } from "react";

import { BudgetHistoryChart } from "./budget-history-chart";
import { BUDGET_FREQUENCY_SHORT } from "./frequency-label";

/**
 * Budgets chart-card for the /charts page. Reuses the page's
 * granularity + currency filters and the point-labels toggle.
 *
 * Granularity maps 1:1 to budget frequency (same enum: daily / weekly
 * / monthly / yearly), so flipping the page's toggle scopes both the
 * analytics charts and this budget set to the same period.
 *
 * Picking a budget on the right toggles a single-budget history view
 * (last 12 cycles vs the current cap).
 */
export function BudgetsChart({
  granularity,
  currency,
  withPointLabels,
}: {
  granularity: Granularity;
  currency: string;
  withPointLabels: boolean;
}) {
  const today = useMemo(() => localDateKey(new Date()), []);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const snapshotQ = useQuery({
    queryKey: ["budget-snapshot", today],
    queryFn: () => getBudgetSnapshot(today),
  });

  const snapshots = useFilteredSortedSnapshots(
    snapshotQ.data,
    currency,
    granularity,
  );

  // Derive the effective drilled budget from the raw pick + the
  // filtered set: if the picked budget isn't in the current filter
  // (user switched currency/granularity), fall back to the snapshot
  // view automatically. Keeps the raw pick so navigating back to a
  // matching filter restores the drill. Avoids the setState-in-effect
  // anti-pattern.
  const budgetId =
    pickedId && snapshots.some((s) => s.id === pickedId) ? pickedId : null;

  const selectOptions = snapshots
    .filter((s): s is BudgetSnapshot & { id: string } => s.id !== null)
    .map((s) => ({ value: s.id, label: budgetLabel(s) }));

  return (
    <Card>
      <Stack>
        <Group justify="space-between">
          <ChartTitle
            info="A snapshot of every active budget against this cycle's spend.
            Filtered by the page's granularity (e.g., monthly granularity → monthly
            budgets only) and currency. Pick a budget on the right to see its last
            12 cycles."
            title="Budgets"
          />
          {selectOptions.length > 0 && (
            <Select
              aria-label="Budget history"
              clearable
              data={selectOptions}
              placeholder="View history of…"
              value={budgetId}
              onChange={setPickedId}
            />
          )}
        </Group>
        {budgetId ? (
          <DrillView
            budgetId={budgetId}
            label={
              snapshots.filter((s) => s.id === budgetId).map(budgetLabel)[0] ??
              "Budget history"
            }
            today={today}
            withPointLabels={withPointLabels}
          />
        ) : (
          <SnapshotView
            error={snapshotQ.error}
            granularity={granularity}
            isLoading={snapshotQ.isLoading}
            snapshots={snapshots}
            today={today}
          />
        )}
      </Stack>
    </Card>
  );
}

function DrillView({
  budgetId,
  today,
  label,
  withPointLabels,
}: {
  budgetId: string;
  today: string;
  label: string;
  withPointLabels: boolean;
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
    <BudgetHistoryChart
      history={q.data}
      label={label}
      withPointLabels={withPointLabels}
    />
  );
}

function SnapshotView({
  snapshots,
  today,
  isLoading,
  error,
  granularity,
}: {
  snapshots: BudgetSnapshot[];
  today: string;
  isLoading: boolean;
  error: unknown;
  granularity: Granularity;
}) {
  if (isLoading) return <Text c="dimmed">Loading…</Text>;
  if (error)
    return <Text c="red">Failed to load: {(error as Error).message}</Text>;
  if (snapshots.length === 0) {
    return (
      <Text c="dimmed" ta="center">
        No {granularity} budgets set.
      </Text>
    );
  }
  return (
    <Stack>
      {snapshots.map((s) => (
        <BudgetRow key={rowKey(s)} snapshot={s} today={today} />
      ))}
    </Stack>
  );
}

/**
 * Filter to (currency, frequency), then suppress lone parent rollups
 * and sort hierarchically (parent first, subs alpha by name).
 *
 * Lone-rollup suppression: a "Food rollup" above a single
 * "Food › Restaurants" row would just duplicate the same numbers.
 * Count sibling subcategory budgets per `categoryName`; if there's
 * only one, drop the synthetic rollup. (Keying on `categoryName`
 * because subcategory snapshots have `categoryId: null` — the
 * snapshot view COALESCEs the parent name onto each row.)
 */
function useFilteredSortedSnapshots(
  raw: BudgetSnapshot[] | undefined,
  currency: string,
  frequency: Granularity,
): BudgetSnapshot[] {
  return useMemo(() => {
    if (!raw) return [];
    const filtered = raw.filter(
      (s) => s.currency === currency && s.frequency === frequency,
    );

    const subCount = new Map<string, number>();
    for (const s of filtered) {
      if (s.subcategoryId === null) continue;
      subCount.set(s.categoryName, (subCount.get(s.categoryName) ?? 0) + 1);
    }
    const visible = filtered.filter((s) => {
      if (!s.parentRollup) return true;
      return (subCount.get(s.categoryName) ?? 0) > 1;
    });

    visible.sort((a, b) => {
      const catCmp = a.categoryName.localeCompare(b.categoryName);
      if (catCmp !== 0) return catCmp;
      const aParent = a.subcategoryId === null;
      const bParent = b.subcategoryId === null;
      if (aParent !== bParent) return aParent ? -1 : 1;
      if (aParent && bParent) {
        if (a.parentRollup !== b.parentRollup) return a.parentRollup ? 1 : -1;
        return 0;
      }
      return a.subcategoryName!.localeCompare(b.subcategoryName!);
    });
    return visible;
  }, [raw, currency, frequency]);
}

function BudgetRow({
  snapshot,
  today,
}: {
  snapshot: BudgetSnapshot;
  today: string;
}) {
  const actual = BigInt(snapshot.actual);
  const budgeted = BigInt(snapshot.amount);
  const pct = pctConsumed(snapshot);
  const label = snapshot.subcategoryName
    ? `${snapshot.categoryName} › ${snapshot.subcategoryName}`
    : snapshot.categoryName;

  // Pro-rated target: where the bar "should" be at this point in the
  // cycle if spending were perfectly even. The vertical tick on the
  // bar marks this; the text below summarizes under/over pace.
  const pctElapsed = elapsedPct(snapshot.cycleStart, snapshot.cycleEnd, today);
  const expectedMinor =
    (budgeted * BigInt(Math.round(pctElapsed * 100))) / 10000n;
  const delta = actual - budgeted; // positive = over
  const deltaPace = actual - expectedMinor;

  // Color reflects status relative to two thresholds, matching the
  // credit-limit bar palette used in the accounts sidebar:
  //   teal   — under (or on) pace
  //   yellow — over pace but still inside the cycle's budget cap
  //   red    — over the full cap
  const color = pct >= 100 ? "red" : pct > pctElapsed ? "yellow" : "teal";

  return (
    <Stack gap={0}>
      <Group justify="space-between">
        <Group gap={6}>
          <Text fw={500}>{label}</Text>
          {snapshot.parentRollup && (
            <Tooltip
              label="Rollup — sums the per-cycle amounts of every subcategory budget
              under this category."
              multiline
              w={300}
            >
              <Sigma
                aria-label="Rollup of subcategory budgets"
                color="var(--mantine-color-dimmed)"
                size={14}
              />
            </Tooltip>
          )}
        </Group>
        <Text c="dimmed" ff="monospace" size="xs">
          {formatMoney(actual, snapshot.currency)} spent {" · "}
          <Mark color={color}>
            {formatMoney(delta > 0n ? delta : -delta, snapshot.currency)}{" "}
            {delta > 0n ? "over" : "left"}
          </Mark>
        </Text>
      </Group>
      <Box pos="relative">
        <Progress.Root size="lg">
          <Progress.Section color={color} value={Math.min(pct, 100)} />
        </Progress.Root>
        {/* Today-pace tick: a 2px vertical line at pctElapsed%. */}
        <Box
          aria-hidden
          pos="absolute"
          style={{
            top: -2,
            bottom: -2,
            left: `${pctElapsed}%`,
            width: 2,
            backgroundColor: "var(--mantine-color-dark-6)",
            transform: "translateX(-1px)",
            pointerEvents: "none",
          }}
        />
      </Box>
      <Group justify="space-between">
        <Text c="dimmed" ff="monospace" size="xs">
          {formatMoney(budgeted, snapshot.currency)}
          {BUDGET_FREQUENCY_SHORT[snapshot.frequency]}
        </Text>
        <Text c="dimmed" ff="monospace" size="xs">
          Pace {formatMoney(expectedMinor, snapshot.currency)}
          {" · "}
          {deltaPace === 0n
            ? "on pace"
            : `${formatMoney(deltaPace > 0n ? deltaPace : -deltaPace, snapshot.currency)} ${
                deltaPace > 0n ? "over" : "under"
              }`}
        </Text>
      </Group>
    </Stack>
  );
}

function budgetLabel(s: BudgetSnapshot): string {
  const base = s.subcategoryName
    ? `${s.categoryName} › ${s.subcategoryName}`
    : s.categoryName;
  return s.parentRollup ? `${base} (rollup)` : base;
}

/**
 * Percent of the cycle window that has elapsed as of `today`, in
 * [0, 100]. Days are counted inclusively at both ends — day 1 of a
 * 30-day cycle = ~3.33% elapsed, the final day = 100%. Outside the
 * window we clamp; this can happen for yearly budgets whose cycle
 * extends well past today, in which case the tick sits at the
 * appropriate fraction of the year so far.
 */
function elapsedPct(
  cycleStart: string,
  cycleEnd: string,
  today: string,
): number {
  const start = parseYmd(cycleStart);
  const end = parseYmd(cycleEnd);
  const t = parseYmd(today);
  const totalDays = (end - start) / 86_400_000 + 1;
  const elapsedDays = (t - start) / 86_400_000 + 1;
  const ratio = elapsedDays / totalDays;
  if (ratio < 0) return 0;
  if (ratio > 1) return 100;
  return ratio * 100;
}

function parseYmd(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function pctConsumed(s: BudgetSnapshot): number {
  const actual = Number(BigInt(s.actual));
  const amount = Number(BigInt(s.amount));
  if (amount === 0) return 0;
  return (actual / amount) * 100;
}

// Snapshot rows don't have a stable id for the synthetic rollups;
// derive a unique key from the target shape so React's reconciler is
// happy across re-renders.
function rowKey(s: BudgetSnapshot): string {
  if (s.id) return s.id;
  return `rollup:${s.categoryId}:${s.currency}:${s.frequency}`;
}
