import {
  type CategoryLineFormValues,
  CategorySelector,
} from "@/components/category-selector";
import { MoneyField } from "@/components/money-field";
import { SectionHeader } from "@/components/section-header";
import { TagsField } from "@/components/tags-field";

import type { CategoryWithSubs } from "@fin/schemas";
import { ActionIcon, Button, Card, Group, Stack, Text } from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";

/**
 * One-line editor: a single amount + category + tags. Used by transaction
 * forms (income/expense single line) and bill forms (one default
 * line) and later recurring-plan default lines. The "Split across
 * categories" button promotes the host form into multi-line mode by
 * appending a second empty line.
 *
 * `amountOptional` mirrors `MultiLineEditor` — for sub default lines
 * whose amount may vary per period, the field is rendered without the
 * required marker.
 */
export function SingleLineEditor({
  line,
  categories,
  allTags,
  amountOptional = false,
  onUpdate,
  onSplit,
}: {
  line: CategoryLineFormValues;
  categories: CategoryWithSubs[];
  allTags: string[];
  amountOptional?: boolean;
  onUpdate: (patch: Partial<CategoryLineFormValues>) => void;
  onSplit: () => void;
}) {
  return (
    <Stack>
      <MoneyField
        label={amountOptional ? "Amount (optional)" : "Amount"}
        min={0}
        required={!amountOptional}
        value={line.amount}
        onChange={(v) => onUpdate({ amount: v })}
      />
      <CategorySelector
        categories={categories}
        categoryId={line.categoryId}
        newCategoryName={line.newCategoryName}
        newSubcategoryName={line.newSubcategoryName}
        subcategoryId={line.subcategoryId}
        onCategoryChange={(v) => onUpdate({ categoryId: v })}
        onNewCategoryNameChange={(v) => onUpdate({ newCategoryName: v })}
        onNewSubcategoryNameChange={(v) => onUpdate({ newSubcategoryName: v })}
        onSubcategoryChange={(v) => onUpdate({ subcategoryId: v })}
      />
      <TagsField
        allTags={allTags}
        label="Tags (optional)"
        value={line.tagNames}
        onChange={(v) => onUpdate({ tagNames: v })}
      />
      <Button
        leftSection={<Plus size={14} />}
        type="button"
        variant="subtle"
        w="fit-content"
        onClick={onSplit}
      >
        Split across categories
      </Button>
    </Stack>
  );
}

/**
 * Multi-line editor: each line in its own card with category + tags + amount,
 * an "Add line" button at the bottom, and a running total card. Caller owns
 * the lines array; this component is purely presentational over it.
 *
 * `amountOptional` is for loan-plan default lines: amounts vary per period
 * (amortizing loans), so the template records categorization but leaves the
 * amount blank. When set, individual amounts aren't required and the
 * running-total card is hidden (a sum of "may-be-blank" values is misleading).
 *
 * `summary` overrides the bottom summary card. The default is
 * `{ label: "Total", value: <Σ lines> }`. Loan-payment forms pass
 * `{ label: "Principal", value: <Amount − Σ lines> }` because in that
 * context the lines are a partial categorization, not the full payment.
 */
export function MultiLineEditor({
  lines,
  categories,
  allTags,
  onUpdate,
  onAdd,
  onRemove,
  amountOptional = false,
  summary,
}: {
  lines: CategoryLineFormValues[];
  categories: CategoryWithSubs[];
  allTags: string[];
  onUpdate: (index: number, patch: Partial<CategoryLineFormValues>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  amountOptional?: boolean;
  summary?: { label: string; value: string };
}) {
  const total = lines.reduce((s, l) => {
    const n = Number(l.amount);
    return Number.isFinite(n) ? s + n : s;
  }, 0);
  const summaryRow = summary ?? { label: "Total", value: total.toFixed(2) };
  return (
    <Stack>
      {lines.map((line, i) => (
        <Card key={i}>
          <Stack>
            <Group justify="space-between">
              <SectionHeader compact>Line {i + 1}</SectionHeader>
              <ActionIcon
                aria-label={`Remove line ${i + 1}`}
                color="red"
                onClick={() => onRemove(i)}
              >
                <Trash2 size={14} />
              </ActionIcon>
            </Group>
            <MoneyField
              label={amountOptional ? "Amount (optional)" : "Amount"}
              min={0}
              required={!amountOptional}
              value={line.amount}
              onChange={(v) => onUpdate(i, { amount: v })}
            />
            <CategorySelector
              categories={categories}
              categoryId={line.categoryId}
              newCategoryName={line.newCategoryName}
              newSubcategoryName={line.newSubcategoryName}
              subcategoryId={line.subcategoryId}
              onCategoryChange={(v) => onUpdate(i, { categoryId: v })}
              onNewCategoryNameChange={(v) =>
                onUpdate(i, { newCategoryName: v })
              }
              onNewSubcategoryNameChange={(v) =>
                onUpdate(i, { newSubcategoryName: v })
              }
              onSubcategoryChange={(v) => onUpdate(i, { subcategoryId: v })}
            />
            <TagsField
              allTags={allTags}
              label="Tags (optional)"
              value={line.tagNames}
              onChange={(v) => onUpdate(i, { tagNames: v })}
            />
          </Stack>
        </Card>
      ))}
      <Button
        leftSection={<Plus size={14} />}
        type="button"
        variant="subtle"
        w="fit-content"
        onClick={onAdd}
      >
        Add line
      </Button>
      {!amountOptional && (
        <Card>
          <Group justify="space-between">
            <SectionHeader compact>{summaryRow.label}</SectionHeader>
            <Text ff="monospace" fw={500}>
              {summaryRow.value}
            </Text>
          </Group>
        </Card>
      )}
    </Stack>
  );
}
