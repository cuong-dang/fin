import { AccountSelect } from "@/components/account-select";
import { MultiLineEditor, SingleLineEditor } from "@/components/line-editor";
import { MoneyField } from "@/components/money-field";
import { localDateKey } from "@/lib/dates";
import { formatMoneyPlain } from "@/lib/money";

import type {
  Account,
  Bill,
  BillType,
  CategoryWithSubs,
  Tag,
  TransactionBody,
  TransactionLineBody,
} from "@fin/schemas";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Link } from "react-router";

type TxType = "income" | "expense" | "transfer" | "payment";

// "Payment" is a UX portal that ultimately submits as a typed transaction:
//   - Credit card payment → transfer (checking → CC)
//   - Loan payment → transfer (checking/CC → loan), with optional lines
//     categorizing interest/fee portions
//   - Bill charge → expense with billId. The bill picker groups all
//     three bill types (utility / subscription / other); the user
//     doesn't think about the type at charge time.
type PaymentKind = "creditCard" | "loan" | "bill";

const PAYMENT_KIND_OPTIONS: {
  value: PaymentKind;
  label: string;
  disabled?: boolean;
}[] = [
  { value: "creditCard", label: "Credit card" },
  { value: "loan", label: "Loan" },
  { value: "bill", label: "Bill" },
];

export type InitialTxValues = {
  type: TxType;
  // Only consulted when type === "payment". Edit pre-fills it so the
  // Payment tab opens on the right kind (creditCard / loan / bill).
  paymentKind?: PaymentKind | undefined;
  date: string;
  pending: boolean;
  description: string;
  accountId: string;
  destinationAccountId: string;
  transferAmount: string;
  lines: TransactionLineBody[];
  billId: string;
};

const emptyLine = (): TransactionLineBody => ({
  amount: "",
  categoryId: "",
  newCategoryName: "",
  subcategoryId: "",
  newSubcategoryName: "",
  tagNames: [],
});

export function TransactionForm({
  accounts,
  categories,
  tags,
  bills,
  submitLabel,
  initialValues,
  onSubmit,
  onCancel,
  pending,
  error,
  extraActions,
}: {
  accounts: Account[];
  categories: CategoryWithSubs[];
  tags: Tag[];
  bills: Bill[];
  submitLabel: string;
  initialValues?: InitialTxValues;
  onSubmit: (body: TransactionBody) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  /** Extra buttons rendered alongside Save / Cancel (e.g., "Refund"). */
  extraActions?: ReactNode;
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
    billId: "",
  };

  const [type, setType] = useState<TxType>(defaults.type);
  const [lines, setLines] = useState<TransactionLineBody[]>(defaults.lines);
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
  const [billId, setBillId] = useState(defaults.billId);
  const [paymentKind, setPaymentKind] = useState<PaymentKind>(
    defaults.paymentKind ?? "creditCard",
  );

  // Active bills + the currently linked one (even if cancelled), so editing
  // a payment that points at a since-cancelled bill still resolves.
  const billOptions = bills.filter(
    (b) => b.cancelledAt === null || b.id === billId,
  );

  function applyCreditCard(ccId: string) {
    setDestinationAccountId(ccId);
    if (!ccId) {
      setAccountId("");
      setTransferAmount("");
      return;
    }
    const cc = accounts.find((a) => a.id === ccId);
    if (cc?.defaultPayFromAccountId) {
      setAccountId(cc.defaultPayFromAccountId);
    }
    if (cc) {
      // Pre-fill with the card's outstanding balance — the
      // overwhelming common case is "pay this off in full." Credit
      // cards carry a negative present balance (debt), so flip the
      // sign. A non-negative balance means there's nothing to pay
      // (zero or a credit) — leave the field blank for manual entry.
      const owed = -BigInt(cc.presentBalance);
      setTransferAmount(owed > 0n ? formatMoneyPlain(owed, cc.currency) : "");
    }
  }

  function applyLoan(loanId: string) {
    setDestinationAccountId(loanId);
    if (!loanId) {
      setAccountId("");
      setTransferAmount("");
      setLines([]);
      return;
    }
    const loan = accounts.find((a) => a.id === loanId);
    if (loan?.defaultPayFromAccountId) {
      setAccountId(loan.defaultPayFromAccountId);
    }
    if (loan?.loan) {
      setTransferAmount(
        formatMoneyPlain(BigInt(loan.loan.amountPerPeriod), loan.currency),
      );
      setLines(
        loan.loan.defaultLines.map((l) => ({
          amount: l.amount
            ? formatMoneyPlain(BigInt(l.amount), loan.currency)
            : "",
          categoryId: l.categoryId,
          newCategoryName: "",
          subcategoryId: l.subcategoryId ?? "",
          newSubcategoryName: "",
          tagNames: l.tags.map((t) => t.name),
        })),
      );
    }
  }

  function applyBill(billId: string) {
    setBillId(billId);
    if (!billId) {
      // Cleared the picker — leave existing lines/account; the user is
      // probably about to pick a different bill or switch tabs.
      return;
    }
    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;
    if (bill.defaultPayFromAccountId)
      setAccountId(bill.defaultPayFromAccountId);
    setLines(
      bill.defaultLines.map((l) => ({
        amount: l.amount ? formatMoneyPlain(BigInt(l.amount), l.currency) : "",
        categoryId: l.categoryId,
        newCategoryName: "",
        subcategoryId: l.subcategoryId ?? "",
        newSubcategoryName: "",
        tagNames: l.tags.map((t) => t.name),
      })),
    );
  }

  const isMultiLine = lines.length > 1;
  const categoryKindForType =
    type === "income" ? "income" : type === "transfer" ? null : "expense";
  const relevantCategories =
    categoryKindForType === null
      ? []
      : categories.filter((c) => c.kind === categoryKindForType);
  // Source-account filter:
  //   - Transfer: All accounts. Targets must be checking/savings.
  //   - Payment > Credit card: source must be checking/savings.
  //   - Payment > Loan: source can be checking/savings or credit_card.
  //   - Other (expense/income): all account types — a CC charge is an
  //     expense from the CC, a refund/credit is income to it.
  const sourceAccountPool =
    type === "payment" && paymentKind === "creditCard"
      ? accounts.filter((a) => a.type === "checking_savings")
      : type === "payment" && paymentKind === "loan"
        ? accounts.filter((a) => a.type !== "loan")
        : accounts;
  const sourceAccounts = sourceAccountPool.filter(
    (a) => a.id !== destinationAccountId,
  );
  const destinationAccounts = accounts
    .filter((a) => a.type === "checking_savings")
    .filter((a) => a.id !== accountId);
  const ccAccounts = accounts.filter((a) => a.type === "credit_card");
  const loanAccounts = accounts.filter((a) => a.type === "loan");
  const allTagNames = tags.map((t) => t.name);

  function handleTypeChange(newType: TxType) {
    setType(newType);
    // Reset line + sub state on tab switch — matches existing behavior so
    // each tab starts fresh. paymentKind defaults back too, since it only
    // applies to the Payment tab.
    setAccountId("");
    setBillId("");
    setDestinationAccountId("");
    setLines([emptyLine()]);
    setTransferAmount("");
    setPaymentKind("creditCard");
  }

  function handlePaymentKindChange(newKind: PaymentKind) {
    setPaymentKind(newKind);
    setAccountId("");
    setBillId("");
    setDestinationAccountId("");
    setLines([emptyLine()]);
    setTransferAmount("");
  }

  function handleAccountChange(newId: string) {
    setAccountId(newId);
    if (destinationAccountId === newId) setDestinationAccountId("");
  }

  function handleDestinationChange(newId: string) {
    setDestinationAccountId(newId);
    if (accountId === newId) setAccountId("");
  }

  function updateLine(index: number, patch: Partial<TransactionLineBody>) {
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
      if (paymentKind === "creditCard") {
        onSubmit({
          type: "transfer",
          ...commonBase,
          amount: transferAmount,
          accountId,
          destinationAccountId,
        });
        return;
      }
      if (paymentKind === "loan") {
        onSubmit({
          type: "transfer",
          ...commonBase,
          amount: transferAmount,
          accountId,
          destinationAccountId,
          lines,
        });
        return;
      }
      onSubmit({
        type: "expense",
        ...commonBase,
        accountId,
        billId,
        lines,
      });
      return;
    }

    onSubmit({
      type,
      ...commonBase,
      accountId,
      lines,
    });
  };

  const paymentEntityMissing =
    type === "payment" &&
    ((paymentKind === "creditCard" && !destinationAccountId) ||
      (paymentKind === "loan" && !destinationAccountId) ||
      (paymentKind === "bill" && !billId));

  if (accounts.length === 0) {
    return (
      <Stack>
        <Text c="dimmed">You need to create an account first.</Text>
        <Button
          component={Link}
          to="/accounts/new"
          variant="subtle"
          w="fit-content"
        >
          Create account
        </Button>
      </Stack>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TypeTabs value={type} onChange={handleTypeChange} />
        {type === "payment" && (
          <Stack>
            <SegmentedControl
              data={PAYMENT_KIND_OPTIONS}
              value={paymentKind}
              onChange={(v) => handlePaymentKindChange(v as PaymentKind)}
            />
            {paymentKind === "creditCard" && (
              <PaymentCreditCardPicker
                ccAccounts={ccAccounts}
                destinationAccountId={destinationAccountId}
                onChange={applyCreditCard}
              />
            )}
            {paymentKind === "loan" && (
              <PaymentLoanPicker
                destinationAccountId={destinationAccountId}
                loanAccounts={loanAccounts}
                onChange={applyLoan}
              />
            )}
            {paymentKind === "bill" && (
              <PaymentBillPicker
                billId={billId}
                billOptions={billOptions}
                totalBills={bills.length}
                onChange={applyBill}
              />
            )}
          </Stack>
        )}

        {!paymentEntityMissing && (
          <>
            <AccountSelect
              accounts={sourceAccounts}
              label={
                type === "transfer" ||
                (type === "payment" &&
                  (paymentKind === "creditCard" || paymentKind === "loan"))
                  ? "From Account"
                  : "Account"
              }
              required
              value={accountId}
              onChange={handleAccountChange}
            />

            {type === "transfer" && (
              <AccountSelect
                accounts={destinationAccounts}
                label="To Account"
                required
                value={destinationAccountId}
                onChange={handleDestinationChange}
              />
            )}
          </>
        )}

        {!paymentEntityMissing &&
          (type === "payment" && paymentKind === "loan" ? (
            <>
              <MoneyField
                description="Total payment incl. principal, interest, fees."
                label="Amount"
                min={0}
                value={transferAmount}
                onChange={setTransferAmount}
              />
              <MultiLineEditor
                allTags={allTagNames}
                categories={relevantCategories}
                lines={lines}
                summary={{
                  label: "Principal",
                  value: (
                    (Number(transferAmount) || 0) -
                    lines.reduce(
                      (s, l) =>
                        Number.isFinite(Number(l.amount))
                          ? s + Number(l.amount)
                          : s,
                      0,
                    )
                  ).toFixed(2),
                }}
                onAdd={addLine}
                onRemove={removeLine}
                onUpdate={updateLine}
              />
            </>
          ) : type === "transfer" ||
            (type === "payment" && paymentKind === "creditCard") ? (
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

            <TextInput
              label="Description"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            {error && <Alert color="red">{error}</Alert>}
            <Group>
              <Button loading={pending} type="submit">
                {submitLabel}
              </Button>
              {extraActions}
              <Button variant="subtle" onClick={onCancel}>
                Cancel
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </form>
  );
}

function PaymentCreditCardPicker({
  ccAccounts,
  destinationAccountId,
  onChange,
}: {
  ccAccounts: Account[];
  destinationAccountId: string;
  onChange: (id: string) => void;
}) {
  if (ccAccounts.length === 0) {
    return (
      <Stack>
        <Text c="dimmed">No credit-card accounts yet.</Text>
        <Button
          component={Link}
          to="/accounts/new"
          variant="subtle"
          w="fit-content"
        >
          Create credit-card account
        </Button>
      </Stack>
    );
  }
  return (
    <AccountSelect
      accounts={ccAccounts}
      description="Source account pre-fills from the card's default pay-from."
      label="Credit card"
      placeholder="Select a credit card…"
      required
      value={destinationAccountId}
      onChange={onChange}
    />
  );
}

function PaymentLoanPicker({
  loanAccounts,
  destinationAccountId,
  onChange,
}: {
  loanAccounts: Account[];
  destinationAccountId: string;
  onChange: (id: string) => void;
}) {
  if (loanAccounts.length === 0) {
    return (
      <Stack>
        <Text c="dimmed">No loan accounts yet.</Text>
        <Button
          component={Link}
          to="/accounts/new"
          variant="subtle"
          w="fit-content"
        >
          Create loan account
        </Button>
      </Stack>
    );
  }
  return (
    <AccountSelect
      accounts={loanAccounts}
      description="Source pre-fills from the plan's default pay-from. Add fee/interest lines to categorize the non-principal portion."
      label="Loan"
      placeholder="Select a loan…"
      required
      value={destinationAccountId}
      onChange={onChange}
    />
  );
}

// Single picker covering all bill types. Mantine `Select` (vs the
// `NativeSelect` used elsewhere in this form) is required because we
// want grouped options. Bills are grouped by `type` so the user can
// scroll-with-context. Search is deliberately off — see AccountSelect
// comment for the rationale.
function PaymentBillPicker({
  billOptions,
  billId,
  totalBills,
  onChange,
}: {
  billOptions: Bill[];
  billId: string;
  totalBills: number;
  onChange: (id: string) => void;
}) {
  if (totalBills === 0) {
    return (
      <Stack>
        <Text c="dimmed">No bills yet.</Text>
        <Button
          component={Link}
          to="/bills/new"
          variant="subtle"
          w="fit-content"
        >
          Create bill
        </Button>
      </Stack>
    );
  }
  const GROUP_LABEL: Record<BillType, string> = {
    utility: "Utilities",
    subscription: "Subscriptions",
    other: "Other",
  };
  // Stable section order; only emit groups that have at least one item.
  const ORDER: BillType[] = ["utility", "subscription", "other"];
  const data = ORDER.map((t) => {
    const items = billOptions
      .filter((b) => b.type === t)
      .map((b) => ({
        value: b.id,
        label: b.cancelledAt !== null ? `${b.name} (cancelled)` : b.name,
      }));
    return { group: GROUP_LABEL[t], items };
  }).filter((g) => g.items.length > 0);
  return (
    <Select
      data={data}
      description="Account and lines auto-fill from the bill's defaults; you can edit either."
      label="Bill"
      placeholder="Select a bill…"
      required
      value={billId || null}
      onChange={(v) => onChange(v ?? "")}
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
