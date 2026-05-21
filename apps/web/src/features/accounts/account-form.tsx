import { MoneyField } from "@/components/money-field";
import { PickOrCreate } from "@/components/pick-or-create";
import {
  CcFields,
  LoanPlanFields,
} from "@/features/accounts/account-form-fields";
import { COMMON_CURRENCIES } from "@/lib/currencies";
import { localDateKey } from "@/lib/dates";

import type {
  Account,
  AccountGroup,
  AccountType,
  CategoryWithSubs,
  CreateAccountBody,
  RecurringFrequency,
  Tag,
  TransactionLineBody,
  UpdateAccountBody,
} from "@fin/schemas";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { type ComponentProps, useState } from "react";

export type InitialAccountValues = {
  type: AccountType;
  name: string;
  currency: string;
  accountGroupId: string;
  newGroupName: string;
  balance: string;
  creditLimit: string;
  defaultPayFromAccountId: string;
  amountPerPeriod: string;
  frequency: RecurringFrequency;
  loanLines: TransactionLineBody[];
  excludeFromNetWorth: boolean;
};

// Discriminated mode prop: caller's `onSubmit` signature is precisely the
// body shape that matches its mutation. Avoids casts at the call site.
type Mode =
  | { kind: "new"; onSubmit: (body: CreateAccountBody) => void }
  | { kind: "edit"; onSubmit: (body: UpdateAccountBody) => void };

const EMPTY_VALUES: InitialAccountValues = {
  type: "checking_savings",
  name: "",
  currency: "USD",
  accountGroupId: "",
  newGroupName: "",
  balance: "",
  creditLimit: "",
  defaultPayFromAccountId: "",
  amountPerPeriod: "",
  frequency: "monthly",
  loanLines: [],
  excludeFromNetWorth: false,
};

/**
 * Shared account form for both new and edit. In edit mode `type` and
 * `currency` are read-only (locked at creation); in new mode they're
 * picked by the user. Balance semantics differ too: new sends
 * `startingBalance` once, edit sends `newBalance` only if it changed
 * from the pre-filled current balance.
 */
export function AccountForm({
  mode,
  initialValues,
  groups,
  allAccounts,
  categories,
  tags,
  submitLabel,
  onCancel,
  pending,
  error,
}: {
  mode: Mode;
  initialValues?: InitialAccountValues;
  groups: AccountGroup[];
  allAccounts: Account[];
  categories: CategoryWithSubs[];
  tags: Tag[];
  submitLabel: string;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const isEdit = mode.kind === "edit";
  const defaults = initialValues ?? EMPTY_VALUES;

  const [type, setType] = useState<AccountType>(defaults.type);
  const [name, setName] = useState(defaults.name);
  const [currency, setCurrency] = useState(defaults.currency);
  const [accountGroupId, setAccountGroupId] = useState(defaults.accountGroupId);
  const [newGroupName, setNewGroupName] = useState(defaults.newGroupName);
  const [balance, setBalance] = useState(defaults.balance);
  const [creditLimit, setCreditLimit] = useState(defaults.creditLimit);
  const [defaultPayFromAccountId, setDefaultPayFromAccountId] = useState(
    defaults.defaultPayFromAccountId,
  );
  const [amountPerPeriod, setAmountPerPeriod] = useState(
    defaults.amountPerPeriod,
  );
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    defaults.frequency,
  );
  const [loanLines, setLoanLines] = useState<TransactionLineBody[]>(
    defaults.loanLines,
  );
  const [excludeFromNetWorth, setExcludeFromNetWorth] = useState(
    defaults.excludeFromNetWorth,
  );

  const hasGroups = groups.length > 0;

  const groupValue = accountGroupId || (newGroupName ? "" : null);
  const groupOptions = [
    ...groups.map((g) => ({ value: g.id, label: g.name })),
    ...(newGroupName ? [{ value: "", label: `${newGroupName} (new)` }] : []),
  ];
  const pickGroup = (v: string | null) => {
    if (v === "") return;
    const match = groups.find((g) => g.id === v);
    setAccountGroupId(match?.id ?? "");
    setNewGroupName("");
  };
  const createGroup = (name: string) => {
    setAccountGroupId("");
    setNewGroupName(name);
  };

  const checkingAccounts = allAccounts.filter(
    (a) => a.type === "checking_savings",
  );
  const loanPayFromAccounts = allAccounts.filter((a) => a.type !== "loan");

  const handleSubmit: ComponentProps<"form">["onSubmit"] = (e) => {
    e.preventDefault();
    const creatingNewGroup = !hasGroups || accountGroupId === "";

    if (mode.kind === "new") {
      const common = {
        name,
        currency,
        accountGroupId: creatingNewGroup ? undefined : accountGroupId,
        newAccountGroupName: creatingNewGroup ? newGroupName : undefined,
        startingBalance: balance || "0",
        adjustmentDate: localDateKey(new Date()),
        excludeFromNetWorth,
      };
      if (type === "credit_card") {
        mode.onSubmit({
          type: "credit_card",
          ...common,
          creditLimit,
          defaultPayFromAccountId: defaultPayFromAccountId || undefined,
        });
      } else if (type === "loan") {
        mode.onSubmit({
          type: "loan",
          ...common,
          defaultPayFromAccountId: defaultPayFromAccountId || undefined,
          loan: { amountPerPeriod, frequency, defaultLines: loanLines },
        });
      } else {
        mode.onSubmit({ type: "checking_savings", ...common });
      }
      return;
    }

    // edit
    const balanceChanged = balance !== defaults.balance;
    const common = {
      name,
      accountGroupId: creatingNewGroup ? undefined : accountGroupId,
      newGroupName: creatingNewGroup ? newGroupName : undefined,
      newBalance: balanceChanged ? balance : undefined,
      adjustmentDate: balanceChanged ? localDateKey(new Date()) : undefined,
      excludeFromNetWorth,
    };
    if (type === "credit_card") {
      mode.onSubmit({
        type: "credit_card",
        ...common,
        creditLimit,
        defaultPayFromAccountId: defaultPayFromAccountId || undefined,
      });
    } else if (type === "loan") {
      mode.onSubmit({
        type: "loan",
        ...common,
        defaultPayFromAccountId: defaultPayFromAccountId || undefined,
        loan: { amountPerPeriod, frequency, defaultLines: loanLines },
      });
    } else {
      mode.onSubmit({ type: "checking_savings", ...common });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        {isEdit ? (
          <TextInput disabled label="Type" value={TYPE_DISPLAY[type]} />
        ) : (
          <SegmentedControl
            data={TYPE_OPTIONS}
            value={type}
            onChange={(v) => setType(v as AccountType)}
          />
        )}
        <TextInput
          data-autofocus
          label="Name"
          maxLength={100}
          placeholder={NAME_PLACEHOLDER[type]}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {isEdit ? (
          <TextInput disabled label="Currency" value={currency} />
        ) : (
          <Select
            data={COMMON_CURRENCIES}
            label="Currency"
            required
            value={currency}
            onChange={(v) => v && setCurrency(v)}
          />
        )}
        {hasGroups ? (
          <PickOrCreate
            data={groupOptions}
            label="Account group"
            modalTitle="New account group"
            placeholder="Pick an account group"
            required
            value={groupValue}
            onChange={pickGroup}
            onCreate={createGroup}
          />
        ) : (
          <TextInput
            label="New account group name"
            maxLength={100}
            placeholder="Banks"
            required
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
        )}
        {type === "credit_card" && (
          <CcFields
            creditLimit={creditLimit}
            defaultPayFromAccountId={defaultPayFromAccountId}
            payFromAccounts={checkingAccounts}
            setCreditLimit={setCreditLimit}
            setDefaultPayFromAccountId={setDefaultPayFromAccountId}
          />
        )}
        {type === "loan" && (
          <LoanPlanFields
            amountPerPeriod={amountPerPeriod}
            categories={categories}
            defaultPayFromAccountId={defaultPayFromAccountId}
            frequency={frequency}
            lines={loanLines}
            payFromAccounts={loanPayFromAccounts}
            setAmountPerPeriod={setAmountPerPeriod}
            setDefaultPayFromAccountId={setDefaultPayFromAccountId}
            setFrequency={setFrequency}
            setLines={setLoanLines}
            tags={tags}
          />
        )}
        <MoneyField
          description={balanceDescription(type, isEdit)}
          label={isEdit ? "Balance" : "Starting balance"}
          required={false}
          value={balance}
          onChange={setBalance}
        />
        <Checkbox
          checked={excludeFromNetWorth}
          description="Account stays visible in the sidebar; just doesn't roll into the net-worth total or chart."
          label="Exclude from net worth"
          onChange={(e) => setExcludeFromNetWorth(e.currentTarget.checked)}
        />
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

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: "checking_savings", label: "Checking / savings" },
  { value: "credit_card", label: "Credit card" },
  { value: "loan", label: "Loan" },
];

const TYPE_DISPLAY: Record<AccountType, string> = {
  checking_savings: "Checking / savings",
  credit_card: "Credit card",
  loan: "Loan",
};

const NAME_PLACEHOLDER: Record<AccountType, string> = {
  checking_savings: "Chase Checking",
  credit_card: "Chase Sapphire",
  loan: "Mortgage",
};

function balanceDescription(type: AccountType, isEdit: boolean): string {
  if (isEdit) {
    return "Changing this records an adjustment transaction for the delta.";
  }
  if (type === "credit_card") {
    return "Outstanding balance you currently owe (enter as a negative number).";
  }
  if (type === "loan") {
    return "Leave at 0 if you'd like to record the financed purchase as a separate expense from this loan account — that way the spending lands in a category and the loan balance goes negative automatically. Otherwise, enter the current debt as a negative number.";
  }
  return "";
}
