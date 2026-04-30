import type {
  Account,
  BillType,
  CategoryWithSubs,
  CreateBillBody,
  RecurringFrequency,
  Tag,
} from "@fin/schemas";
import {
  Alert,
  Button,
  Group,
  NativeSelect,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router";

import { AccountSelect } from "@/components/account-select";
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

const TYPE_OPTIONS: { value: BillType; label: string }[] = [
  { value: "utility", label: "Utility" },
  { value: "subscription", label: "Subscription" },
  { value: "other", label: "Other" },
];

// Per-type guidance shown under the type picker. Drives only UX —
// behaviour is identical across types (a bill is a bill on the wire).
const TYPE_HINT: Record<BillType, string> = {
  utility:
    "Variable-amount essential service (electric, water, gas). The amount is left blank in the template — fill it in per charge.",
  subscription:
    "Fixed-amount recurring service (Netflix, software). Pause or cancel anytime.",
  other:
    "Catch-all for periodic charges that aren't utilities or subscriptions — taxes, life or medical insurance premiums, HOA dues, payroll deductions, and the like.",
};

type LineFormValues = CategoryLineFormValues;

export type InitialBillValues = {
  name: string;
  type: BillType;
  currency: string;
  frequency: RecurringFrequency;
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
  tagNames: [],
});

export function BillForm({
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
  initialValues?: InitialBillValues;
  submitLabel: string;
  onSubmit: (body: CreateBillBody) => void;
  pending: boolean;
  error: string | null;
}) {
  const defaults: InitialBillValues = initialValues ?? {
    name: "",
    type: "subscription",
    currency: "USD",
    frequency: "monthly",
    defaultAccountId: "",
    description: "",
    lines: [emptyLine()],
  };

  const [name, setName] = useState(defaults.name);
  const [type, setType] = useState<BillType>(defaults.type);
  const [currency, setCurrency] = useState(defaults.currency);
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    defaults.frequency,
  );
  const [defaultAccountId, setDefaultAccountId] = useState(
    defaults.defaultAccountId,
  );
  const [description, setDescription] = useState(defaults.description);
  const [lines, setLines] = useState<LineFormValues[]>(defaults.lines);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  // Bill charges flow from CASA or CC; loan accounts can't be charge sources.
  const payFromAccounts = accounts.filter((a) => a.type !== "loan");
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
          type,
          currency,
          frequency,
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
        <Stack gap="xs">
          <Text fw={500} size="sm">
            Type
          </Text>
          <SegmentedControl
            data={TYPE_OPTIONS}
            value={type}
            onChange={(v) => setType(v as BillType)}
          />
          <Text c="dimmed" size="xs">
            {TYPE_HINT[type]}
          </Text>
        </Stack>
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
        <AccountSelect
          accounts={payFromAccounts}
          allowNone
          description="Charges for this bill will pre-fill the source account."
          label="Default source account (optional)"
          value={defaultAccountId}
          onChange={setDefaultAccountId}
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
          <Button component={Link} to="/settings/bills" variant="subtle">
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
