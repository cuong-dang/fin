import { MoneyField } from "@/components/money-field";
import { SectionHeader } from "@/components/section-header";

import type {
  CategoryWithSubs,
  LoanDefaultLineBody,
  TransactionLineBody,
} from "@fin/schemas";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  TagsInput,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";
import { CreatableSelect } from "./creatable-select";

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
      <MoneyField
        label={amountOptional ? "Amount (optional)" : "Amount"}
        min={0}
        required={!amountOptional}
        value={line.amount}
        onChange={(v) => onUpdate({ amount: v })}
      />
      {/* TODO: Check the following type assertions. */}
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
      <TagsField
        allTags={allTags}
        label="Tags (optional)"
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
  lines: (TransactionLineBody | LoanDefaultLineBody)[];
  categories: CategoryWithSubs[];
  allTags: string[];
  onUpdate: (
    index: number,
    patch: Partial<TransactionLineBody | LoanDefaultLineBody>,
  ) => void;
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
              label={amountOptional ? "Amount (optional)" : "Amount"}
              min={0}
              required={!amountOptional}
              value={line.amount!}
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
              label="Tags (optional)"
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
 * Category + subcategory picker with implicit-create UX. Each axis
 * renders a `Combobox` (search-as-you-type + dropdown):
 *   - typing filters the list of existing options
 *   - if no exact match exists for the typed text, a "+ Create '…'"
 *     entry surfaces at the top of the dropdown
 *   - clicking either an existing option or the "+ Create…" entry
 *     commits the value; leaving the field with non-matching text
 *     also commits to create (the form state already has the typed
 *     text under `newCategoryName`).
 */
export function CategorySelector({
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
  const creatingNewCategory = categoryId === "";

  const categoryText =
    categories.find((c) => c.id === categoryId)?.name ?? newCategoryName;

  function handleCategoryText(text: string) {
    const match = categories.find((c) => c.name === text);
    if (match) {
      setCategoryId(match.id);
      setNewCategoryName("");
    } else {
      setCategoryId("");
      setNewCategoryName(text);
    }
    // Switching the category invalidates any subcategory selection
    // tied to the previous category.
    setSubcategoryId("");
    setNewSubcategoryName("");
  }

  const subcategoriesForPicker =
    categories.find((c) => c.id === categoryId)?.subcategories ?? [];

  const subcategoryText =
    subcategoriesForPicker.find((s) => s.id === subcategoryId)?.name ??
    newSubcategoryName;

  function handleSubcategoryText(text: string) {
    if (creatingNewCategory) {
      // No existing subcategories under a yet-to-be-created category;
      // any text is "create new" by definition.
      setSubcategoryId("");
      setNewSubcategoryName(text);
      return;
    }
    const match = subcategoriesForPicker.find((s) => s.name === text);
    if (match) {
      setSubcategoryId(match.id);
      setNewSubcategoryName("");
    } else {
      setSubcategoryId("");
      setNewSubcategoryName(text);
    }
  }

  return (
    <>
      <CreatableSelect
        data={categories.map((c) => c.name)}
        label="Category"
        placeholder="Select or type to create…"
        required
        value={categoryText}
        onChange={handleCategoryText}
      />
      {(creatingNewCategory || categoryId !== "") && (
        <CreatableSelect
          data={
            creatingNewCategory ? [] : subcategoriesForPicker.map((s) => s.name)
          }
          label="Subcategory (optional)"
          placeholder="Select or type to create…"
          value={subcategoryText}
          onChange={handleSubcategoryText}
        />
      )}
    </>
  );
}

/**
 * Tag entry field. Type-and-space hardens a tag into a pill; backspace or ×
 * removes one. While focused, existing-tag suggestions appear horizontally
 * below the input — clicking one adds it. The list filters as the user types.
 *
 * `data={[]}` + `openOnFocus={false}` suppress Mantine's vertical dropdown
 * since we render our own horizontal suggestions. `acceptValueOnBlur={false}`
 * stops Mantine from auto-committing the typed-but-uncommitted search when
 * focus shifts to a suggestion pill — otherwise typing "es" then clicking
 * "essential" would commit both. We then re-implement the "commit on blur"
 * ourselves at the Stack level: if focus leaves the whole field (e.g., user
 * clicked Save without pressing space), the typed search is committed as a
 * new tag. Suggestion pills are children of the Stack, so clicking one
 * doesn't trigger this path.
 */
export function TagsField({
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
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const trimmed = search.trim().toLowerCase();
  const suggestions = allTags
    .filter((t) => !value.includes(t))
    .filter((t) => trimmed === "" || t.toLowerCase().includes(trimmed));

  return (
    <Stack
      onBlur={(e) => {
        // Keep focused while focus moves to a child (e.g., a suggestion pill).
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setFocused(false);
        const pending = search.trim();
        if (pending && !value.includes(pending)) {
          onChange([...value, pending]);
        }
        setSearch("");
      }}
      onFocus={() => setFocused(true)}
    >
      <TagsInput
        acceptValueOnBlur={false}
        data={[]}
        label={label}
        leftSection={<Tag size={14} />}
        openOnFocus={false}
        placeholder="Type a tag and press space"
        searchValue={search}
        splitChars={[" ", ","]}
        value={value}
        onChange={onChange}
        onSearchChange={setSearch}
      />
      {focused && suggestions.length > 0 && (
        <Group>
          {suggestions.map((t) => (
            <UnstyledButton
              key={t}
              aria-label={`Add tag ${t}`}
              onClick={() => {
                onChange([...value, t]);
                setSearch("");
              }}
            >
              <Badge
                color="black"
                style={{ cursor: "pointer" }}
                tt="none"
                variant="light"
              >
                #{t}
              </Badge>
            </UnstyledButton>
          ))}
        </Group>
      )}
    </Stack>
  );
}
