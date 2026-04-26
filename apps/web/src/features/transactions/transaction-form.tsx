import type {
  Account,
  CategoryWithSubs,
  Subscription,
  Tag,
  TransactionBody,
  TransactionLineBody,
} from "@fin/schemas";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { type ComponentProps, useState } from "react";
import { Link } from "react-router";

import {
  type CategoryLineFormValues,
  packCategoryLine,
} from "@/components/category-selector";
import { MultiLineEditor, SingleLineEditor } from "@/components/line-editor";
import { MoneyField } from "@/components/money-field";
import { localDateKey } from "@/lib/dates";
import { formatMoneyPlain } from "@/lib/money";

type TxType = "income" | "expense" | "transfer" | "payment";

// "Payment" is a UX portal that ultimately submits as a typed transaction
// (today: expense + subscriptionId for sub charges; later: a hybrid type
// for loan and credit-card payments). The kind picker shows all three
// planned sources so the design intent is visible today; only the
// implemented one is enabled.
type PaymentKind = "subscription" | "loan" | "creditCard";

const PAYMENT_KIND_OPTIONS: {
  value: PaymentKind;
  label: string;
  disabled?: boolean;
}[] = [
  { value: "subscription", label: "Subscription" },
  { value: "loan", label: "Loan", disabled: true },
  { value: "creditCard", label: "Credit card", disabled: true },
];

type LineFormValues = CategoryLineFormValues;

export type InitialTxValues = {
  type: TxType;
  date: string;
  pending: boolean;
  description: string;
  accountId: string;
  destinationAccountId: string;
  transferAmount: string;
  lines: LineFormValues[];
  subscriptionId: string;
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
  subscriptions,
  submitLabel,
  initialValues,
  onSubmit,
  pending,
  error,
}: {
  accounts: Account[];
  categories: CategoryWithSubs[];
  tags: Tag[];
  subscriptions: Subscription[];
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
    subscriptionId: "",
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
  const [subscriptionId, setSubscriptionId] = useState(defaults.subscriptionId);
  // Only "subscription" is enabled today; future loan/CC kinds keep
  // their entity ids in sibling state when added.
  const [paymentKind, setPaymentKind] = useState<PaymentKind>("subscription");

  // Active subs + the currently linked one (even if cancelled), so editing
  // a payment that points at a since-cancelled sub still resolves.
  const subOptions = subscriptions.filter(
    (s) => s.cancelledAt === null || s.id === subscriptionId,
  );

  function applySubscription(newId: string) {
    setSubscriptionId(newId);
    if (!newId) {
      // Cleared the picker — leave existing lines/account; the user is
      // probably about to pick a different sub or switch tabs.
      return;
    }
    const sub = subscriptions.find((s) => s.id === newId);
    if (!sub) return;
    setLines(
      sub.defaultLines.map((l) => ({
        amount: formatMoneyPlain(BigInt(l.amount), l.currency),
        categoryId: l.categoryId,
        newCategoryName: "",
        subcategoryId: l.subcategoryId ?? "",
        newSubcategoryName: "",
        tags: l.tags.map((t) => t.name),
      })),
    );
    if (sub.defaultAccountId) setAccountId(sub.defaultAccountId);
  }

  const isMultiLine = lines.length > 1;
  // Categories shown in the line editor. Income lines pick income-kind;
  // expense and payment both pick expense-kind. Transfer doesn't have lines.
  const categoryKindForType =
    type === "income" ? "income" : type === "transfer" ? null : "expense";
  const relevantCategories =
    categoryKindForType === null
      ? []
      : categories.filter((c) => c.kind === categoryKindForType);
  const sourceAccounts = accounts.filter((a) => a.id !== destinationAccountId);
  const destinationAccounts = accounts.filter((a) => a.id !== accountId);
  const allTagNames = tags.map((t) => t.name);

  function handleTypeChange(newType: TxType) {
    setType(newType);
    // Reset line + sub state on tab switch — matches existing behavior so
    // each tab starts fresh. paymentKind defaults back too, since it only
    // applies to the Payment tab.
    setLines([emptyLine()]);
    setSubscriptionId("");
    setPaymentKind("subscription");
  }

  function handlePaymentKindChange(newKind: PaymentKind) {
    setPaymentKind(newKind);
    // Switching kinds invalidates the prefilled state (each kind has its
    // own entity + template). For now only `subscription` is enabled, so
    // we just clear the sub-specific state.
    setSubscriptionId("");
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

  const lineToBody = (l: LineFormValues): TransactionLineBody =>
    packCategoryLine(l);

  const handleSubmit: ComponentProps<"form">["onSubmit"] = (e) => {
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

    if (type === "payment") {
      // "Payment" is a UI portal; sub charges are persisted as expenses
      // with `subscriptionId` set. Future loan / CC payments will get
      // their own type with a hybrid leg shape.
      onSubmit({
        type: "expense",
        ...commonBase,
        accountId,
        subscriptionId,
        lines: lines.map(lineToBody),
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

  // Payment tab requires a source entity (today: a subscription) before
  // anything else makes sense. Hide the rest of the form until one is
  // picked, and surface a "create one first" affordance when there are
  // no subs at all. Future kinds will plug in via this same gate.
  const paymentEntityMissing =
    type === "payment" && paymentKind === "subscription" && !subscriptionId;

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TypeTabs value={type} onChange={handleTypeChange} />

        {type === "payment" && (
          <Stack gap="sm">
            <SegmentedControl
              data={PAYMENT_KIND_OPTIONS}
              value={paymentKind}
              onChange={(v) => handlePaymentKindChange(v as PaymentKind)}
            />
            {paymentKind === "subscription" && (
              <PaymentSubscriptionPicker
                subOptions={subOptions}
                subscriptionId={subscriptionId}
                totalSubs={subscriptions.length}
                onChange={applySubscription}
              />
            )}
            {/*
              Future: loan + credit-card pickers go here, branching on
              `paymentKind`. Each will fetch its own list (recurring plans
              for loans; credit-card-type accounts for CC), have its own
              `apply<Kind>` prefill, and the gate above gets the matching
              "<kind>EntityMissing" check.
            */}
          </Stack>
        )}

        {!paymentEntityMissing &&
          (type === "transfer" ? (
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
          ))}

        {!paymentEntityMissing && (
          <>
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
          </>
        )}
      </Stack>
    </form>
  );
}

function PaymentSubscriptionPicker({
  subOptions,
  subscriptionId,
  totalSubs,
  onChange,
}: {
  subOptions: Subscription[];
  subscriptionId: string;
  totalSubs: number;
  onChange: (id: string) => void;
}) {
  if (totalSubs === 0) {
    return (
      <Stack>
        <Text c="dimmed" size="sm">
          You don't have any subscriptions yet.
        </Text>
        <Button
          component={Link}
          to="/subscriptions/new"
          variant="subtle"
          w="fit-content"
        >
          Create subscription
        </Button>
      </Stack>
    );
  }
  return (
    <NativeSelect
      data={[
        { value: "", label: "Select a subscription…", disabled: true },
        ...subOptions.map((s) => ({
          value: s.id,
          label: s.cancelledAt !== null ? `${s.name} (cancelled)` : s.name,
        })),
      ]}
      description="Account and lines auto-fill from the subscription's defaults; you can edit either."
      label="Subscription"
      required
      value={subscriptionId}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function TypeTabs({
  value,
  onChange,
}: {
  value: TxType;
  onChange: (t: TxType) => void;
}) {
  const options: TxType[] = ["expense", "income", "transfer", "payment"];
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
