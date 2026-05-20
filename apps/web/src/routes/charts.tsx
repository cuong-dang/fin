import {
  defaultRange,
  GranularityToggle,
} from "@/components/granularity-toggle";
import { CashFlowChart } from "@/features/analytics/cash-flow-chart";
import { CashFlowComparisonChart } from "@/features/analytics/cash-flow-comparison-chart";
import { CategoryTagChart } from "@/features/analytics/category-tag-chart";
import { NetWorthChart } from "@/features/analytics/net-worth-chart";
import { BudgetsChart } from "@/features/budgets/budgets-chart";
import { listAccounts } from "@/lib/endpoints";

import type { Granularity } from "@fin/schemas";
import { Group, Select, Stack, Switch } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

const POINT_LABELS_KEY = "fin:charts.withPointLabels";

/**
 * Charts page. Hosts cross-chart controls (granularity + currency) at
 * the top and stacks individual chart components below. Per-chart
 * controls (e.g., direction toggle, account-group filter for cash
 * flow) live inside each chart component.
 */
export function ChartsRoute() {
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  // Pick a default currency from the user's accounts. Each chart filters
  // on a single currency since amounts in different currencies aren't
  // commensurable. Multi-currency users can switch via the picker.
  const currencies = useMemo(() => {
    const seen = new Set<string>();
    for (const a of accountsQ.data ?? []) seen.add(a.currency);
    return [...seen].sort();
  }, [accountsQ.data]);

  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [currency, setCurrency] = useState<string>("");
  const activeCurrency = currency || currencies[0] || "";
  const { start, end } = defaultRange(granularity);

  // Persisted across reloads. Cheap UX nicety; localStorage failure
  // (private mode, quota) is fine — falls back to off.
  const [withPointLabels, setWithPointLabels] = useState<boolean>(() => {
    try {
      return localStorage.getItem(POINT_LABELS_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(POINT_LABELS_KEY, withPointLabels ? "1" : "0");
    } catch {
      // ignore
    }
  }, [withPointLabels]);

  return (
    <Stack p="xs">
      <Group justify="space-between">
        <Group>
          <GranularityToggle value={granularity} onChange={setGranularity} />
          <Switch
            checked={withPointLabels}
            label="Point labels"
            onChange={(e) => setWithPointLabels(e.currentTarget.checked)}
          />
        </Group>
        {currencies.length > 0 && (
          <Select
            aria-label="Currency"
            data={currencies}
            value={activeCurrency}
            onChange={(v) => setCurrency(v ?? "")}
          />
        )}
      </Group>
      <BudgetsChart
        currency={activeCurrency}
        granularity={granularity}
        withPointLabels={withPointLabels}
      />
      <CashFlowComparisonChart
        currency={activeCurrency}
        granularity={granularity}
        withPointLabels={withPointLabels}
      />
      <CashFlowChart
        currency={activeCurrency}
        end={end}
        granularity={granularity}
        start={start}
        withPointLabels={withPointLabels}
      />
      <CategoryTagChart
        currency={activeCurrency}
        end={end}
        granularity={granularity}
        start={start}
      />
      <NetWorthChart
        currency={activeCurrency}
        end={end}
        granularity={granularity}
        start={start}
        withPointLabels={withPointLabels}
      />
    </Stack>
  );
}
