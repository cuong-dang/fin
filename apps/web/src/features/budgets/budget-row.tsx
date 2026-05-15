import { DestructiveIconButton } from "@/components/destructive-icon-button";
import { deleteBudget, updateBudget } from "@/lib/endpoints";
import { formatMoney, formatMoneyPlain } from "@/lib/money";

import type { Budget, BudgetFrequency } from "@fin/schemas";
import { ActionIcon, Button, Group, Select, Text, TextInput } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";

import {
  BUDGET_FREQUENCY_OPTIONS,
  BUDGET_FREQUENCY_SHORT,
} from "./frequency-label";

/**
 * One row representing an existing budget. Displays
 * "{amount}/{freq} {currency}" in read mode; inline-edits amount and
 * frequency on click. Currency and target are immutable post-create
 * (mirrors the server contract).
 */
export function BudgetRow({
  budget,
  invalidate,
}: {
  budget: Budget;
  invalidate: string[][];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [amountDraft, setAmountDraft] = useState(() =>
    formatMoneyPlain(BigInt(budget.amount), budget.currency),
  );
  const [freqDraft, setFreqDraft] = useState<BudgetFrequency>(budget.frequency);

  const update = useMutation({
    mutationFn: () =>
      updateBudget(budget.id, { amount: amountDraft, frequency: freqDraft }),
    onSuccess: () => {
      for (const k of invalidate) qc.invalidateQueries({ queryKey: k });
      setEditing(false);
    },
  });
  const del = useMutation({
    mutationFn: () => deleteBudget(budget.id),
    onSuccess: () => {
      for (const k of invalidate) qc.invalidateQueries({ queryKey: k });
    },
    onError: (e) => alert((e as Error).message),
  });

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate();
        }}
      >
        <Group>
          <TextInput
            aria-label="Amount"
            data-autofocus
            flex={1}
            inputMode="decimal"
            required
            value={amountDraft}
            onChange={(e) => setAmountDraft(e.target.value)}
          />
          <Select
            allowDeselect={false}
            aria-label="Frequency"
            data={BUDGET_FREQUENCY_OPTIONS}
            value={freqDraft}
            w={130}
            onChange={(v) => v && setFreqDraft(v as BudgetFrequency)}
          />
          <Text c="dimmed">{budget.currency}</Text>
          <Button loading={update.isPending} size="xs" type="submit">
            Save
          </Button>
          <Button
            size="xs"
            type="button"
            variant="subtle"
            onClick={() => {
              setAmountDraft(
                formatMoneyPlain(BigInt(budget.amount), budget.currency),
              );
              setFreqDraft(budget.frequency);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </Group>
      </form>
    );
  }

  return (
    <Group justify="space-between">
      <Text ff="monospace">
        {formatMoney(BigInt(budget.amount), budget.currency)}
        {BUDGET_FREQUENCY_SHORT[budget.frequency]}
      </Text>
      <Group gap={0}>
        <ActionIcon aria-label="Edit budget" onClick={() => setEditing(true)}>
          <Pencil size={14} />
        </ActionIcon>
        <DestructiveIconButton
          confirmMessage="Delete this budget? You can re-add it later."
          label="Delete budget"
          onConfirm={() => del.mutate()}
        />
      </Group>
    </Group>
  );
}
