import { AccountSelect } from "@/components/account-select";
import { MultiLineEditor } from "@/components/line-editor";
import { MoneyField } from "@/components/money-field";

import type {
  Account,
  CategoryWithSubs,
  RecurringFrequency,
  Tag,
  TransactionLineBody,
} from "@fin/schemas";
import { Select } from "@mantine/core";
import type { Dispatch, SetStateAction } from "react";

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const emptyLine = (): TransactionLineBody => ({
  amount: "",
  categoryId: "",
  newCategoryName: "",
  subcategoryId: "",
  newSubcategoryName: "",
  tagNames: [],
});

/**
 * Credit-card-specific fields: limit + default pay-from account. Used by
 * the new and edit account forms (state and submit dispatch live in the
 * parent — this is presentation only).
 *
 * `payFromAccounts` is pre-filtered by the caller.
 */
export function CcFields({
  creditLimit,
  setCreditLimit,
  defaultPayFromAccountId,
  setDefaultPayFromAccountId,
  payFromAccounts,
}: {
  creditLimit: string;
  setCreditLimit: (v: string) => void;
  defaultPayFromAccountId: string;
  setDefaultPayFromAccountId: (v: string) => void;
  payFromAccounts: Account[];
}) {
  return (
    <>
      <MoneyField
        label="Credit limit"
        min={0}
        value={creditLimit}
        onChange={setCreditLimit}
      />
      {payFromAccounts.length > 0 && (
        <AccountSelect
          accounts={payFromAccounts}
          allowNone
          description="Pre-fills the source account when paying this card."
          label="Default pay-from account (optional)"
          value={defaultPayFromAccountId}
          onChange={setDefaultPayFromAccountId}
        />
      )}
    </>
  );
}

export function LoanPlanFields({
  amountPerPeriod,
  setAmountPerPeriod,
  frequency,
  setFrequency,
  defaultPayFromAccountId,
  setDefaultPayFromAccountId,
  lines,
  setLines,
  payFromAccounts,
  categories,
  tags,
}: {
  amountPerPeriod: string;
  setAmountPerPeriod: (v: string) => void;
  frequency: RecurringFrequency;
  setFrequency: (v: RecurringFrequency) => void;
  defaultPayFromAccountId: string;
  setDefaultPayFromAccountId: (v: string) => void;
  lines: TransactionLineBody[];
  setLines: Dispatch<SetStateAction<TransactionLineBody[]>>;
  payFromAccounts: Account[];
  categories: CategoryWithSubs[];
  tags: Tag[];
}) {
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const allTagNames = tags.map((t) => t.name);

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
    <>
      <MoneyField
        label="Amount per period"
        min={0}
        value={amountPerPeriod}
        onChange={setAmountPerPeriod}
      />
      <Select
        data={FREQUENCY_OPTIONS}
        label="Frequency"
        required
        value={frequency}
        onChange={(v: RecurringFrequency | null) => v && setFrequency(v)}
      />
      {payFromAccounts.length > 0 && (
        <AccountSelect
          accounts={payFromAccounts}
          allowNone
          description="Pre-fills the source when paying this loan."
          label="Default pay-from account (optional)"
          value={defaultPayFromAccountId}
          onChange={setDefaultPayFromAccountId}
        />
      )}
      <MultiLineEditor
        allTags={allTagNames}
        amountOptional
        categories={expenseCategories}
        lines={lines}
        onAdd={addLine}
        onRemove={removeLine}
        onUpdate={updateLine}
      />
    </>
  );
}
