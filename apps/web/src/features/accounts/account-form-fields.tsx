import type {
  Account,
  CategoryWithSubs,
  RecurringFrequency,
  Tag,
} from "@fin/schemas";
import { NativeSelect, TextInput } from "@mantine/core";
import type { Dispatch, SetStateAction } from "react";

import type { CategoryLineFormValues } from "@/components/category-selector";
import { MultiLineEditor } from "@/components/line-editor";
import { MoneyField } from "@/components/money-field";

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const emptyLine = (): CategoryLineFormValues => ({
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
 * `payFromAccounts` is pre-filtered by the caller (checking_savings only,
 * and excluding the current account in the edit case).
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
      <NativeSelect
        data={[
          { value: "", label: "— No default —" },
          ...payFromAccounts.map((a) => ({
            value: a.id,
            label: `${a.name} (${a.currency})`,
          })),
        ]}
        description="Pre-fills the source account when paying this card."
        label="Default pay-from account (optional)"
        value={defaultPayFromAccountId}
        onChange={(e) => setDefaultPayFromAccountId(e.target.value)}
      />
    </>
  );
}

/**
 * Loan-plan fields: amount/frequency/first-payment-date + default
 * pay-from + description + default-line templates. Used by the new and
 * edit account forms.
 *
 * `payFromAccounts` is pre-filtered by the caller (any non-loan account,
 * minus the current account in the edit case). Categories and tags are
 * passed raw; this component filters categories to expense kind (loan
 * default lines always categorize expenses) and derives the tag names
 * for the line editor's autocomplete.
 */
export function LoanPlanFields({
  amountPerPeriod,
  setAmountPerPeriod,
  frequency,
  setFrequency,
  firstPaymentDate,
  setFirstPaymentDate,
  payFromId,
  setPayFromId,
  description,
  setDescription,
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
  firstPaymentDate: string;
  setFirstPaymentDate: (v: string) => void;
  payFromId: string;
  setPayFromId: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  lines: CategoryLineFormValues[];
  setLines: Dispatch<SetStateAction<CategoryLineFormValues[]>>;
  payFromAccounts: Account[];
  categories: CategoryWithSubs[];
  tags: Tag[];
}) {
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const allTagNames = tags.map((t) => t.name);

  function updateLine(i: number, patch: Partial<CategoryLineFormValues>) {
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
      <NativeSelect
        data={FREQUENCY_OPTIONS}
        label="Frequency"
        value={frequency}
        onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
      />
      <TextInput
        label="First payment date"
        required
        type="date"
        value={firstPaymentDate}
        onChange={(e) => setFirstPaymentDate(e.target.value)}
      />
      <NativeSelect
        data={[
          { value: "", label: "— No default —" },
          ...payFromAccounts.map((a) => ({
            value: a.id,
            label: `${a.name} (${a.currency})`,
          })),
        ]}
        description="Pre-fills the source when paying this loan."
        label="Default pay-from account (optional)"
        value={payFromId}
        onChange={(e) => setPayFromId(e.target.value)}
      />
      <TextInput
        label="Description (optional)"
        maxLength={500}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
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
