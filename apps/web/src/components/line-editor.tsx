import type { CategoryWithSubs } from "@fin/schemas";
import { ActionIcon, Button, Card, Group, Stack, Text } from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";

import {
  type CategoryLineFormValues,
  CategorySelector,
} from "@/components/category-selector";
import { MoneyField } from "@/components/money-field";
import { SectionHeader } from "@/components/section-header";
import { TagsField } from "@/components/tags-field";

/**
 * One-line editor: a single amount + category + tags. Used by transaction
 * forms (income/expense single line) and subscription forms (one default
 * line) and later recurring-plan default lines. The "Split across
 * categories" button promotes the host form into multi-line mode by
 * appending a second empty line.
 */
export function SingleLineEditor({
  line,
  categories,
  allTags,
  onUpdate,
  onSplit,
}: {
  line: CategoryLineFormValues;
  categories: CategoryWithSubs[];
  allTags: string[];
  onUpdate: (patch: Partial<CategoryLineFormValues>) => void;
  onSplit: () => void;
}) {
  return (
    <Stack>
      <MoneyField
        label="Amount"
        min={0}
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
        value={line.tags}
        onChange={(v) => onUpdate({ tags: v })}
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
 */
export function MultiLineEditor({
  lines,
  categories,
  allTags,
  onUpdate,
  onAdd,
  onRemove,
}: {
  lines: CategoryLineFormValues[];
  categories: CategoryWithSubs[];
  allTags: string[];
  onUpdate: (index: number, patch: Partial<CategoryLineFormValues>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const total = lines.reduce((s, l) => {
    const n = Number(l.amount);
    return Number.isFinite(n) ? s + n : s;
  }, 0);
  return (
    <Stack gap="xs">
      {lines.map((line, i) => (
        <Card key={i} padding="sm" withBorder>
          <Stack gap={0}>
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
              label="Amount"
              min={0}
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
              value={line.tags}
              onChange={(v) => onUpdate(i, { tags: v })}
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
      <Card p="sm" withBorder>
        <Group justify="space-between">
          <SectionHeader compact>Total</SectionHeader>
          <Text ff="monospace" fw={500} size="sm">
            {total.toFixed(2)}
          </Text>
        </Group>
      </Card>
    </Stack>
  );
}
