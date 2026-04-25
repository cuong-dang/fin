import type {
  Account,
  CategoryWithSubs,
  Tag,
  TransactionBody,
  TransactionLineBody,
} from "@fin/schemas";
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  NativeSelect,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { MoneyField } from "@/components/money-field";
import { SectionHeader } from "@/components/section-header";
import { TagsField } from "@/components/tags-field";
import { localDateKey } from "@/lib/dates";

import { CategorySelector, CREATE_NEW } from "./category-selector";

type TxType = "income" | "expense" | "transfer";

type LineFormValues = {
  amount: string;
  categoryId: string;
  newCategoryName: string;
  subcategoryId: string;
  newSubcategoryName: string;
  tags: string[];
};

export type InitialTxValues = {
  type: TxType;
  date: string;
  pending: boolean;
  description: string;
  accountId: string;
  destinationAccountId: string;
  transferAmount: string;
  lines: LineFormValues[];
};

const emptyLine = (): LineFormValues => ({
  amount: "",
  categoryId: "",
  newCategoryName: "",
  subcategoryId: "",
  newSubcategoryName: "",
  tags: [],
});

export function TransactionForm({
  accounts,
  categories,
  tags,
  submitLabel,
  initialValues,
  onSubmit,
  pending,
  error,
}: {
  accounts: Account[];
  categories: CategoryWithSubs[];
  tags: Tag[];
  submitLabel: string;
  initialValues?: InitialTxValues;
  onSubmit: (body: TransactionBody) => void;
  pending: boolean;
  error: string | null;
}) {
  const defaults: InitialTxValues = initialValues ?? {
    type: "expense",
    date: localDateKey(new Date()),
    pending: false,
    description: "",
    accountId: "",
    destinationAccountId: "",
    transferAmount: "",
    lines: [emptyLine()],
  };

  const [type, setType] = useState<TxType>(defaults.type);
  const [lines, setLines] = useState<LineFormValues[]>(defaults.lines);
  const [transferAmount, setTransferAmount] = useState(defaults.transferAmount);
  const [accountId, setAccountId] = useState(defaults.accountId);
  const [destinationAccountId, setDestinationAccountId] = useState(
    defaults.destinationAccountId,
  );
  const [dateStr, setDateStr] = useState(
    defaults.date || localDateKey(new Date()),
  );
  const [isPending, setIsPending] = useState(defaults.pending);
  const [description, setDescription] = useState(defaults.description);

  const isMultiLine = lines.length > 1;
  const relevantCategories =
    type === "transfer" ? [] : categories.filter((c) => c.kind === type);
  const sourceAccounts = accounts.filter((a) => a.id !== destinationAccountId);
  const destinationAccounts = accounts.filter((a) => a.id !== accountId);
  const allTagNames = tags.map((t) => t.name);

  function handleTypeChange(newType: TxType) {
    setType(newType);
    setLines([emptyLine()]);
  }

  function handleAccountChange(newId: string) {
    setAccountId(newId);
    if (destinationAccountId === newId) setDestinationAccountId("");
  }

  function handleDestinationChange(newId: string) {
    setDestinationAccountId(newId);
    if (accountId === newId) setAccountId("");
  }

  function updateLine(index: number, patch: Partial<LineFormValues>) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function lineToBody(l: LineFormValues): TransactionLineBody {
    const creatingCategory = l.categoryId === CREATE_NEW;
    return {
      amount: l.amount,
      categoryId: creatingCategory ? undefined : l.categoryId || undefined,
      newCategoryName: creatingCategory ? l.newCategoryName : undefined,
      subcategoryId:
        creatingCategory || l.subcategoryId === CREATE_NEW
          ? undefined
          : l.subcategoryId || undefined,
      newSubcategoryName: creatingCategory
        ? l.newSubcategoryName || undefined
        : l.subcategoryId === CREATE_NEW
          ? l.newSubcategoryName
          : undefined,
      tagNames: l.tags.length > 0 ? l.tags : undefined,
    };
  }

  const handleSubmit: React.ComponentProps<"form">["onSubmit"] = (e) => {
    e.preventDefault();
    const commonBase = {
      pending: isPending,
      date: isPending ? undefined : dateStr,
      description: description || undefined,
    };

    if (type === "transfer") {
      onSubmit({
        type: "transfer",
        ...commonBase,
        amount: transferAmount,
        accountId,
        destinationAccountId,
      });
      return;
    }

    onSubmit({
      type,
      ...commonBase,
      accountId,
      lines: lines.map(lineToBody),
    });
  };

  if (accounts.length === 0) {
    return (
      <Stack>
        <Text c="dimmed" size="sm">
          You need to create an account first.
        </Text>
        <Button component={Link} to="/accounts/new" w="fit-content">
          Create account
        </Button>
      </Stack>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TypeTabs value={type} onChange={handleTypeChange} />

        {type === "transfer" ? (
          <MoneyField
            label="Amount"
            min={0}
            value={transferAmount}
            onChange={setTransferAmount}
          />
        ) : isMultiLine ? (
          <MultiLineEditor
            allTags={allTagNames}
            categories={relevantCategories}
            lines={lines}
            onAdd={addLine}
            onRemove={removeLine}
            onUpdate={updateLine}
          />
        ) : (
          <SingleLineEditor
            allTags={allTagNames}
            categories={relevantCategories}
            line={lines[0]}
            onSplit={addLine}
            onUpdate={(patch) => updateLine(0, patch)}
          />
        )}

        <Checkbox
          checked={isPending}
          label="Mark as pending (settles later)"
          onChange={(e) => setIsPending(e.currentTarget.checked)}
        />

        {!isPending && (
          <TextInput
            label="Date"
            required
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        )}

        <NativeSelect
          data={[
            { value: "", label: "Select…", disabled: true },
            ...sourceAccounts.map((a) => ({
              value: a.id,
              label: `${a.name} (${a.currency})`,
            })),
          ]}
          label={type === "transfer" ? "From account" : "Account"}
          required
          value={accountId}
          onChange={(e) => handleAccountChange(e.target.value)}
        />

        {type === "transfer" && (
          <NativeSelect
            data={[
              { value: "", label: "Select…", disabled: true },
              ...destinationAccounts.map((a) => ({
                value: a.id,
                label: `${a.name} (${a.currency})`,
              })),
            ]}
            label="To account"
            required
            value={destinationAccountId}
            onChange={(e) => handleDestinationChange(e.target.value)}
          />
        )}

        <TextInput
          label="Description (optional)"
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {error && <Alert color="red">{error}</Alert>}

        <Group>
          <Button loading={pending} type="submit">
            {submitLabel}
          </Button>
          <Button component={Link} to="/" variant="subtle">
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function SingleLineEditor({
  line,
  categories,
  allTags,
  onUpdate,
  onSplit,
}: {
  line: LineFormValues;
  categories: CategoryWithSubs[];
  allTags: string[];
  onUpdate: (patch: Partial<LineFormValues>) => void;
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

function MultiLineEditor({
  lines,
  categories,
  allTags,
  onUpdate,
  onAdd,
  onRemove,
}: {
  lines: LineFormValues[];
  categories: CategoryWithSubs[];
  allTags: string[];
  onUpdate: (index: number, patch: Partial<LineFormValues>) => void;
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

function TypeTabs({
  value,
  onChange,
}: {
  value: TxType;
  onChange: (t: TxType) => void;
}) {
  const options: TxType[] = ["expense", "income", "transfer"];
  return (
    <Button.Group>
      {options.map((t) => (
        <Button
          key={t}
          fullWidth
          tt="capitalize"
          type="button"
          variant={value === t ? "filled" : "default"}
          onClick={() => onChange(t)}
        >
          {t}
        </Button>
      ))}
    </Button.Group>
  );
}
