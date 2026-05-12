import { AccountSelect } from "@/components/account-select";
import { MultiLineEditor, SingleLineEditor } from "@/components/line-editor";
import { COMMON_CURRENCIES } from "@/lib/currencies";

import type {
  Account,
  BillType,
  CategoryWithSubs,
  CreateBillBody,
  RecurringFrequency,
  Tag,
  TransactionLineBody,
} from "@fin/schemas";
import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const TYPE_OPTIONS: { value: BillType; label: string }[] = [
  { value: "utility", label: "Utility" },
  { value: "subscription", label: "Subscription" },
  { value: "other", label: "Other" },
];

const TYPE_HINT: Record<BillType, string> = {
  utility:
    "Variable-amount essential service (electric, water, gas). The amount is left blank in the template — fill it in per charge.",
  subscription:
    "Fixed-amount recurring service (Netflix, software). Pause or cancel anytime.",
  other:
    "Catch-all for periodic charges that aren't utilities or subscriptions — taxes, life or medical insurance premiums, HOA dues, payroll deductions, and the like.",
};

export type InitialBillValues = {
  name: string;
  type: BillType;
  currency: string;
  frequency: RecurringFrequency;
  defaultPayFromAccountId: string;
  description: string;
  lines: TransactionLineBody[];
};

const emptyLine = (): TransactionLineBody => ({
  amount: "",
  categoryId: "",
  newCategoryName: "",
  subcategoryId: "",
  newSubcategoryName: "",
  tagNames: [],
});

export function BillForm({
  accounts,
  categories,
  tags,
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  accounts: Account[];
  categories: CategoryWithSubs[];
  tags: Tag[];
  initialValues?: InitialBillValues;
  submitLabel: string;
  onSubmit: (body: CreateBillBody) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const defaults: InitialBillValues = initialValues ?? {
    name: "",
    type: "subscription",
    currency: "USD",
    frequency: "monthly",
    defaultPayFromAccountId: "",
    description: "",
    lines: [emptyLine()],
  };

  const [name, setName] = useState(defaults.name);
  const [type, setType] = useState<BillType>(defaults.type);
  const [currency, setCurrency] = useState(defaults.currency);
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    defaults.frequency,
  );
  const [defaultPayFromAccountId, setDefaultPayFromAccountId] = useState(
    defaults.defaultPayFromAccountId,
  );
  const [lines, setLines] = useState<TransactionLineBody[]>(defaults.lines);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const payFromAccounts = accounts.filter((a) => a.type !== "loan");
  const allTagNames = tags.map((t) => t.name);
  const isMultiLine = lines.length > 1;

  function updateLine(i: number, patch: Partial<TransactionLineBody>) {
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
          type,
          currency,
          frequency,
          defaultPayFromAccountId: defaultPayFromAccountId || undefined,
          defaultLines: lines,
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
        <Text fw={500}>Type</Text>
        <SegmentedControl
          data={TYPE_OPTIONS}
          value={type}
          onChange={(v) => setType(v as BillType)}
        />
        <Text c="dimmed" size="xs">
          {TYPE_HINT[type]}
        </Text>
        <Select
          data={COMMON_CURRENCIES}
          label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e!)}
        />
        <Select
          data={FREQUENCY_OPTIONS}
          label="Frequency"
          value={frequency}
          onChange={(e) => setFrequency(e as RecurringFrequency)}
        />
        <AccountSelect
          accounts={payFromAccounts}
          allowNone
          description="Charges for this bill will pre-fill the source account."
          label="Default source account (optional)"
          value={defaultPayFromAccountId}
          onChange={setDefaultPayFromAccountId}
        />

        {isMultiLine ? (
          <MultiLineEditor
            allTags={allTagNames}
            amountOptional
            categories={expenseCategories}
            lines={lines}
            onAdd={addLine}
            onRemove={removeLine}
            onUpdate={updateLine}
          />
        ) : (
          <SingleLineEditor
            allTags={allTagNames}
            amountOptional
            categories={expenseCategories}
            line={lines[0]}
            onSplit={addLine}
            onUpdate={(patch) => updateLine(0, patch)}
          />
        )}

        {error && <Alert color="red">{error}</Alert>}
        <Group>
          <Button loading={pending} type="submit">
            {submitLabel}
          </Button>
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
