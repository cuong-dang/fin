import { CreateNameModal } from "@/components/create-name-modal";
import { MoneyField } from "@/components/money-field";
import { PickOrCreate } from "@/components/pick-or-create";
import { SectionHeader } from "@/components/section-header";

import type { CategoryWithSubs, TransactionLineBody } from "@fin/schemas";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Input,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

/**
 * One-line editor: a single amount + category + tags. Used by transaction
 * forms (income/expense single line), bill forms (one default
 * line), and loan default lines. The "Add line" button promotes the host
 * form into multi-line mode by appending a second empty line.
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
  line: TransactionLineBody;
  categories: CategoryWithSubs[];
  allTags: string[];
  amountOptional?: boolean;
  onUpdate: (patch: Partial<TransactionLineBody>) => void;
  onSplit: () => void;
}) {
  return (
    <Stack>
      <CategorySelector
        categories={categories}
        categoryId={line.categoryId!}
        newCategoryName={line.newCategoryName!}
        newSubcategoryName={line.newSubcategoryName!}
        setCategoryId={(v) => onUpdate({ categoryId: v })}
        setNewCategoryName={(v) => onUpdate({ newCategoryName: v })}
        setNewSubcategoryName={(v) => onUpdate({ newSubcategoryName: v })}
        setSubcategoryId={(v) => onUpdate({ subcategoryId: v })}
        subcategoryId={line.subcategoryId!}
      />
      <MoneyField
        label={amountOptional ? "Amount" : "Amount"}
        min={0}
        required={!amountOptional}
        value={line.amount}
        onChange={(v) => onUpdate({ amount: v })}
      />
      <TagsField
        allTags={allTags}
        label="Tags"
        value={line.tagNames!}
        onChange={(v) => onUpdate({ tagNames: v })}
      />
      <Button
        leftSection={<Plus size={14} />}
        type="button"
        variant="subtle"
        w="fit-content"
        onClick={onSplit}
      >
        Add expense line
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
  lines: TransactionLineBody[];
  categories: CategoryWithSubs[];
  allTags: string[];
  onUpdate: (index: number, patch: Partial<TransactionLineBody>) => void;
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
              required={!amountOptional}
              value={line.amount}
              onChange={(v) => onUpdate(i, { amount: v })}
            />
            {/* All the following type assertions are guaranteed by `emptyLine` in
            account-form-fields. */}
            <CategorySelector
              categories={categories}
              categoryId={line.categoryId!}
              newCategoryName={line.newCategoryName!}
              newSubcategoryName={line.newSubcategoryName!}
              setCategoryId={(v) => onUpdate(i, { categoryId: v })}
              setNewCategoryName={(v) => onUpdate(i, { newCategoryName: v })}
              setNewSubcategoryName={(v) =>
                onUpdate(i, { newSubcategoryName: v })
              }
              setSubcategoryId={(v) => onUpdate(i, { subcategoryId: v })}
              subcategoryId={line.subcategoryId!}
            />
            <TagsField
              allTags={allTags}
              label="Tags"
              value={line.tagNames!}
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
        Add expense line
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

/**
 * Category + subcategory picker.
 *
 * Each field is a tap-only `<Select>` (no search input → no mobile
 * keyboard) paired with a "+" button that opens a small modal for
 * creating a new name. Once created, the new name renders as a
 * "$name (new)" pseudo-option in the Select so the user can see what
 * they're about to submit; the form state carries it under
 * `newCategoryName` / `newSubcategoryName`, mirroring the old
 * implicit-create flow.
 *
 * The synthetic "(new)" option's value is `""` — the same sentinel
 * the form state already uses for "no id assigned yet"
 * (`categoryId === ""`), so the picker doesn't need an extra magic
 * string. Mantine's clearable button returns `null` (not `""`), so
 * tapping the synthetic option stays unambiguously distinguishable
 * from clearing the field.
 */
function CategorySelector({
  categories,
  categoryId,
  setCategoryId,
  newCategoryName,
  setNewCategoryName,
  subcategoryId,
  setSubcategoryId,
  newSubcategoryName,
  setNewSubcategoryName,
}: {
  categories: CategoryWithSubs[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  newCategoryName: string;
  setNewCategoryName: (v: string) => void;
  subcategoryId: string;
  setSubcategoryId: (v: string) => void;
  newSubcategoryName: string;
  setNewSubcategoryName: (v: string) => void;
}) {
  const creatingNewCategory = categoryId === "" && newCategoryName !== "";
  const categoryValue = categoryId || (newCategoryName ? "" : null);
  const categoryOptions = [
    ...categories.map((c) => ({ value: c.id, label: c.name })),
    ...(newCategoryName
      ? [{ value: "", label: `${newCategoryName} (new)` }]
      : []),
  ];

  function pickCategory(v: string | null) {
    // Tapping the "(new)" pseudo-option is a no-op — it's already
    // selected, and there's no id to assign.
    if (v === "") return;
    const match = categories.find((c) => c.id === v);
    setCategoryId(match?.id ?? "");
    setNewCategoryName("");
    setSubcategoryId("");
    setNewSubcategoryName("");
  }

  function createCategory(name: string) {
    setCategoryId("");
    setNewCategoryName(name);
    setSubcategoryId("");
    setNewSubcategoryName("");
  }

  const subcategoriesForPicker =
    categories.find((c) => c.id === categoryId)?.subcategories ?? [];
  const subcategoryValue = subcategoryId || (newSubcategoryName ? "" : null);
  const subcategoryOptions = [
    ...subcategoriesForPicker.map((s) => ({ value: s.id, label: s.name })),
    ...(newSubcategoryName
      ? [{ value: "", label: `${newSubcategoryName} (new)` }]
      : []),
  ];

  function pickSubcategory(v: string | null) {
    if (v === "") return;
    const match = subcategoriesForPicker.find((s) => s.id === v);
    setSubcategoryId(match?.id ?? "");
    setNewSubcategoryName("");
  }

  function createSubcategory(name: string) {
    setSubcategoryId("");
    setNewSubcategoryName(name);
  }

  return (
    <>
      <PickOrCreate
        data={categoryOptions}
        label="Category"
        modalTitle="New category"
        placeholder="Pick a category"
        required
        value={categoryValue}
        onChange={pickCategory}
        onCreate={createCategory}
      />
      {(creatingNewCategory || categoryId !== "") && (
        <PickOrCreate
          data={subcategoryOptions}
          // When the parent category is itself unsaved, there's no
          // existing subcategory list to pick from — the user must
          // create. Disable the Select rather than show empty data.
          disabled={creatingNewCategory && !newSubcategoryName}
          label="Subcategory"
          modalTitle="New subcategory"
          placeholder={
            creatingNewCategory
              ? "No existing subcategories — tap + to add"
              : "Pick a subcategory"
          }
          value={subcategoryValue}
          onChange={pickSubcategory}
          onCreate={createSubcategory}
        />
      )}
    </>
  );
}

/**
 * Tag field — tap-only chip picker. Selected tags render as filled,
 * removable badges; unselected tags from the workspace render below
 * as outlined pills (tap to add). A "+" button opens a small modal
 * to create a brand-new tag. No text input — no surprise keyboard
 * pop on mobile.
 *
 * The same UX runs on desktop for consistency; the "+" button is
 * still tappable with a mouse.
 */
function TagsField({
  label,
  allTags,
  value,
  onChange,
}: {
  label?: string;
  allTags: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  const available = allTags.filter((t) => !value.includes(t));

  const add = (t: string) => {
    if (!value.includes(t)) onChange([...value, t]);
  };
  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  return (
    <Input.Wrapper label={label}>
      <Stack>
        {value.length > 0 && (
          <Group>
            {value.map((t) => (
              <Badge
                key={t}
                color="dark"
                rightSection={
                  <ActionIcon
                    aria-label={`Remove tag ${t}`}
                    color="white"
                    size={12}
                    variant="transparent"
                    onClick={() => remove(t)}
                  >
                    <X />
                  </ActionIcon>
                }
                tt="none"
              >
                {t}
              </Badge>
            ))}
          </Group>
        )}
        <Group>
          <UnstyledButton
            aria-label={`Create new tag`}
            onClick={() => setCreating(true)}
          >
            <Badge style={{ cursor: "pointer" }} tt="none" variant="outline">
              New
            </Badge>
          </UnstyledButton>
          {available.map((t) => (
            <UnstyledButton
              key={t}
              aria-label={`Add tag ${t}`}
              onClick={() => add(t)}
            >
              <Badge
                color="gray"
                style={{ cursor: "pointer" }}
                tt="none"
                variant="outline"
              >
                {t}
              </Badge>
            </UnstyledButton>
          ))}
        </Group>
      </Stack>
      {creating && (
        <CreateNameModal
          title="New tag"
          onCancel={() => setCreating(false)}
          onSubmit={(name) => {
            add(name);
            setCreating(false);
          }}
        />
      )}
    </Input.Wrapper>
  );
}
