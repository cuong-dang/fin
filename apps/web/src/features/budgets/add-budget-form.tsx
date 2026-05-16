import { createBudget } from "@/lib/endpoints";

import type { BudgetFrequency } from "@fin/schemas";
import { Button, Group, Select, TextInput } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { BUDGET_FREQUENCY_OPTIONS } from "./frequency-label";

/**
 * Inline "add budget" form. The caller pins the target (category or
 * subcategory) via the `target` prop; user fills in amount, currency,
 * and frequency. Currency choices are passed in (typically the
 * workspace's account currencies).
 */
export function AddBudgetForm({
  target,
  currencies,
  invalidate,
}: {
  target:
    | { kind: "category"; categoryId: string }
    | { kind: "subcategory"; subcategoryId: string };
  currencies: string[];
  invalidate: string[][];
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "USD");
  const [frequency, setFrequency] = useState<BudgetFrequency>("monthly");

  const m = useMutation({
    mutationFn: () =>
      createBudget({
        ...(target.kind === "category"
          ? { categoryId: target.categoryId }
          : { subcategoryId: target.subcategoryId }),
        amount,
        currency,
        frequency,
      }),
    onSuccess: () => {
      for (const k of invalidate) qc.invalidateQueries({ queryKey: k });
      setAmount("");
    },
    onError: (e) => alert((e as Error).message),
  });

  const trimmed = amount.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Group>
        <TextInput
          aria-label="Amount"
          flex={1}
          inputMode="decimal"
          placeholder="Amount"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Select
          aria-label="Currency"
          data={currencies.length > 0 ? currencies : ["USD"]}
          flex={1}
          value={currency}
          onChange={(v) => v && setCurrency(v)}
        />
        <Select
          aria-label="Frequency"
          data={BUDGET_FREQUENCY_OPTIONS}
          flex={1}
          value={frequency}
          onChange={(v) => v && setFrequency(v as BudgetFrequency)}
        />
        <Button
          disabled={trimmed.length === 0}
          loading={m.isPending}
          size="xs"
          type="submit"
        >
          Add
        </Button>
      </Group>
    </form>
  );
}
