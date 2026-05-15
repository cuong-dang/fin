import { formatMoney } from "@/lib/money";

import type { BudgetSnapshot } from "@fin/schemas";
import {
  Box,
  Card,
  Group,
  Progress,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useMemo } from "react";

import { BUDGET_FREQUENCY_SHORT } from "./frequency-label";

/**
 * Budget chart — one progress-bar row per budget, sorted by percent
 * consumed (desc). Grouped by currency since budgets aren't FX-
 * converted in v1. Income vs expense are also separated within each
 * currency because "100%" means opposite things for the two kinds:
 * for expense it's a danger threshold (red), for income it's the
 * target (green).
 *
 * Each row is clickable when the budget is a real DB row (`id` is
 * set); synthetic parent-rollups have `id: null` and aren't
 * drillable.
 */
export function BudgetsChart({
  snapshots,
  today,
  onSelect,
}: {
  snapshots: BudgetSnapshot[];
  today: string;
  onSelect: (id: string) => void;
}) {
  // Group by (currency, kind) where kind is inferred from amount sign
  // intent — there's no `kind` on the snapshot, so we'll just group
  // by currency for now and color all bars on the expense scale.
  // Income coloring is a small follow-up; meanwhile income budgets
  // still render usefully against teal/yellow/red.
  const byCurrency = useMemo(() => {
    const map = new Map<string, BudgetSnapshot[]>();
    for (const s of snapshots) {
      const arr = map.get(s.currency) ?? [];
      arr.push(s);
      map.set(s.currency, arr);
    }
    // Group hierarchically: per parent category (alpha), the parent
    // row(s) first, then its subcategory rows (alpha by sub name).
    // Within "parents," real budgets sort before synthetic rollups
    // and ties break on frequency.
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const catCmp = a.categoryName.localeCompare(b.categoryName);
        if (catCmp !== 0) return catCmp;
        const aParent = a.subcategoryId === null;
        const bParent = b.subcategoryId === null;
        if (aParent !== bParent) return aParent ? -1 : 1;
        if (aParent && bParent) {
          if (a.parentRollup !== b.parentRollup) return a.parentRollup ? 1 : -1;
          return a.frequency.localeCompare(b.frequency);
        }
        return (a.subcategoryName ?? "").localeCompare(b.subcategoryName ?? "");
      });
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [snapshots]);

  return (
    <Stack p="xs">
      {byCurrency.map(([currency, rows]) => (
        <Card key={currency}>
          <Stack>
            <Title order={5}>{currency}</Title>
            {rows.map((s) => (
              <BudgetRow
                key={rowKey(s)}
                snapshot={s}
                today={today}
                onSelect={onSelect}
              />
            ))}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

function BudgetRow({
  snapshot,
  today,
  onSelect,
}: {
  snapshot: BudgetSnapshot;
  today: string;
  onSelect: (id: string) => void;
}) {
  const actual = BigInt(snapshot.actual);
  const amount = BigInt(snapshot.amount);
  const pct = pctConsumed(snapshot);
  const label = snapshot.subcategoryName
    ? `${snapshot.categoryName} › ${snapshot.subcategoryName}`
    : snapshot.categoryName;
  const drillable = snapshot.id !== null;

  // Pro-rated target: where the bar "should" be at this point in the
  // cycle if spending were perfectly even. The vertical tick on the
  // bar marks this; the text below summarizes under/over pace.
  const pctElapsed = elapsedPct(snapshot.cycleStart, snapshot.cycleEnd, today);
  const expectedMinor =
    (amount * BigInt(Math.round(pctElapsed * 100))) / 10000n;
  const delta = actual - expectedMinor; // positive = over pace

  // Color reflects status relative to two thresholds, matching the
  // credit-limit bar palette used in the accounts sidebar:
  //   teal   — under (or on) pace
  //   yellow — over pace but still inside the cycle's budget cap
  //   red    — over the full cap
  const color = pct >= 100 ? "red.6" : pct > pctElapsed ? "yellow.6" : "teal.6";

  const body = (
    <Stack gap={4}>
      <Group justify="space-between">
        <Text fw={500}>
          {label}
          {snapshot.parentRollup && (
            <Text c="dimmed" component="span" ml={6} size="xs">
              (rollup)
            </Text>
          )}
        </Text>
        <Text c="dimmed" ff="monospace" size="sm">
          {formatMoney(actual, snapshot.currency)} of{" "}
          {formatMoney(amount, snapshot.currency)}
          {BUDGET_FREQUENCY_SHORT[snapshot.frequency]}
        </Text>
      </Group>
      <Box pos="relative">
        <Progress.Root size="lg">
          <Progress.Section color={color} value={Math.min(pct, 100)}>
            {pct >= 15 && <Progress.Label>{Math.round(pct)}%</Progress.Label>}
          </Progress.Section>
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
      <Group gap="xs" justify="space-between">
        <Text c="dimmed" size="xs">
          {snapshot.cycleStart} → {snapshot.cycleEnd}
        </Text>
        <Text c={color} ff="monospace" size="xs">
          Pace {formatMoney(expectedMinor, snapshot.currency)}
          {" · "}
          {delta === 0n
            ? "on pace"
            : `${formatMoney(delta > 0n ? delta : -delta, snapshot.currency)} ${
                delta > 0n ? "over" : "under"
              }`}
        </Text>
      </Group>
    </Stack>
  );

  if (!drillable) return body;
  return (
    <UnstyledButton onClick={() => onSelect(snapshot.id!)}>
      {body}
    </UnstyledButton>
  );
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
