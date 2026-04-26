import type {
  Account,
  CategoryWithSubs,
  CreateSubscriptionBody,
  RecurringFrequency,
  Tag,
} from "@fin/schemas";
import {
  Alert,
  Button,
  Group,
  NativeSelect,
  Stack,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router";

import {
  type CategoryLineFormValues,
  packCategoryLine,
} from "@/components/category-selector";
import { MultiLineEditor, SingleLineEditor } from "@/components/line-editor";
import { COMMON_CURRENCIES } from "@/lib/currencies";

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

type LineFormValues = CategoryLineFormValues;

export type InitialSubValues = {
  name: string;
  currency: string;
  frequency: RecurringFrequency;
  firstChargeDate: string;
  defaultAccountId: string;
  description: string;
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

export function SubscriptionForm({
  accounts,
  categories,
  tags,
  initialValues,
  submitLabel,
  onSubmit,
  pending,
  error,
}: {
  accounts: Account[];
  categories: CategoryWithSubs[];
  tags: Tag[];
  initialValues?: InitialSubValues;
  submitLabel: string;
  onSubmit: (body: CreateSubscriptionBody) => void;
  pending: boolean;
  error: string | null;
}) {
  const defaults: InitialSubValues = initialValues ?? {
    name: "",
    currency: "USD",
    frequency: "monthly",
    firstChargeDate: "",
    defaultAccountId: "",
    description: "",
    lines: [emptyLine()],
  };

  const [name, setName] = useState(defaults.name);
  const [currency, setCurrency] = useState(defaults.currency);
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    defaults.frequency,
  );
  const [firstChargeDate, setFirstChargeDate] = useState(
    defaults.firstChargeDate,
  );
  const [defaultAccountId, setDefaultAccountId] = useState(
    defaults.defaultAccountId,
  );
  const [description, setDescription] = useState(defaults.description);
  const [lines, setLines] = useState<LineFormValues[]>(defaults.lines);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const allTagNames = tags.map((t) => t.name);
  const isMultiLine = lines.length > 1;

  function updateLine(i: number, patch: Partial<LineFormValues>) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          currency,
          frequency,
          firstChargeDate,
          defaultAccountId: defaultAccountId || undefined,
          description: description || undefined,
          defaultLines: lines.map(packCategoryLine),
        });
      }}
    >
      <Stack>
        <TextInput
          data-autofocus
          label="Name"
          maxLength={100}
          placeholder="Netflix"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <NativeSelect
          data={COMMON_CURRENCIES}
          label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
        <NativeSelect
          data={FREQUENCY_OPTIONS}
          label="Frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
        />
        <TextInput
          label="First charge date"
          required
          type="date"
          value={firstChargeDate}
          onChange={(e) => setFirstChargeDate(e.target.value)}
        />
        <NativeSelect
          data={[
            { value: "", label: "— No default —" },
            ...accounts.map((a) => ({
              value: a.id,
              label: `${a.name} (${a.currency})`,
            })),
          ]}
          description="Charges from this subscription will pre-fill the source account."
          label="Default source account (optional)"
          value={defaultAccountId}
          onChange={(e) => setDefaultAccountId(e.target.value)}
        />

        {isMultiLine ? (
          <MultiLineEditor
            allTags={allTagNames}
            categories={expenseCategories}
            lines={lines}
            onAdd={addLine}
            onRemove={removeLine}
            onUpdate={updateLine}
          />
        ) : (
          <SingleLineEditor
            allTags={allTagNames}
            categories={expenseCategories}
            line={lines[0]}
            onSplit={addLine}
            onUpdate={(patch) => updateLine(0, patch)}
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
          <Button
            component={Link}
            to="/settings/subscriptions"
            variant="subtle"
          >
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
