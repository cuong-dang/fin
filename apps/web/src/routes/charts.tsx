import {
  defaultRange,
  GranularityToggle,
} from "@/components/granularity-toggle";
import { CashFlowChart } from "@/features/analytics/cash-flow-chart";
import { CategorySpendingChart } from "@/features/analytics/category-spending-chart";
import { NetWorthChart } from "@/features/analytics/net-worth-chart";
import { listAccounts } from "@/lib/endpoints";

import type { Granularity } from "@fin/schemas";
import { Group, NativeSelect, Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

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

  return (
    <Stack p="xs">
      <Group>
        <GranularityToggle value={granularity} onChange={setGranularity} />
        {currencies.length > 1 && (
          <NativeSelect
            aria-label="Currency"
            data={currencies}
            value={activeCurrency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        )}
      </Group>
      <CashFlowChart
        currency={activeCurrency}
        end={end}
        granularity={granularity}
        start={start}
      />
      <CategorySpendingChart
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
      />
    </Stack>
  );
}
