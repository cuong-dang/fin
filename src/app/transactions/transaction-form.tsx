"use client";

import Link from "next/link";
import { useState } from "react";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { localDateKey } from "@/lib/dates";

export type AccountOption = {
  id: string;
  name: string;
  currency: string;
};

export type CategoryOption = {
  id: string;
  kind: "income" | "expense";
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};

export type TagOption = {
  id: string;
  name: string;
};

export type TxType = "income" | "expense" | "transfer";

export type InitialTxValues = {
  type: TxType;
  date: string;
  amount: string; // plain decimal string
  description: string;
  accountId: string;
  destinationAccountId: string;
  categoryId: string;
  subcategoryId: string;
  tagId: string;
};

export function TransactionForm({
  accounts,
  categories,
  tags,
  action,
  title,
  submitLabel,
  initialValues,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  tags: TagOption[];
  action: (formData: FormData) => Promise<void>;
  title: string;
  submitLabel: string;
  initialValues?: InitialTxValues;
}) {
  const defaults: InitialTxValues = initialValues ?? {
    type: "expense",
    date: localDateKey(new Date()),
    amount: "",
    description: "",
    accountId: "",
    destinationAccountId: "",
    categoryId: "",
    subcategoryId: "",
    tagId: "",
  };

  const [type, setType] = useState<TxType>(defaults.type);
  const [categoryId, setCategoryId] = useState(defaults.categoryId);
  const [accountId, setAccountId] = useState(defaults.accountId);
  const [destinationAccountId, setDestinationAccountId] = useState(
    defaults.destinationAccountId,
  );
  const [dateStr, setDateStr] = useState(defaults.date);

  const relevantCategories =
    type === "transfer" ? [] : categories.filter((c) => c.kind === type);
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const subcategories = selectedCategory?.subcategories ?? [];
  // Transfers can't have source == destination. Each side hides the other's
  // selection. When the other side is empty the filter is a no-op.
  const sourceAccounts = accounts.filter((a) => a.id !== destinationAccountId);
  const destinationAccounts = accounts.filter((a) => a.id !== accountId);

  function handleTypeChange(newType: TxType) {
    setType(newType);
    setCategoryId(""); // previous category may belong to wrong kind
  }

  function handleAccountChange(newId: string) {
    setAccountId(newId);
    if (destinationAccountId === newId) setDestinationAccountId("");
  }

  function handleDestinationChange(newId: string) {
    setDestinationAccountId(newId);
    if (accountId === newId) setAccountId("");
  }

  async function handleSubmit(formData: FormData) {
    formData.set("type", type);
    await action(formData);
  }

  if (accounts.length === 0) {
    return (
      <FormPage size="lg">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-4 text-sm">
          You need to create an account first.
        </p>
        <Button asChild className="mt-6">
          <Link href="/accounts/new">Create account</Link>
        </Button>
      </FormPage>
    );
  }

  return (
    <FormPage size="lg">
      <BackLink href="/" />
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>

      <form action={handleSubmit} className="mt-6 space-y-4">
        <TypeTabs value={type} onChange={handleTypeChange} />

        <Field label="Amount" htmlFor="amount">
          <MoneyInput
            id="amount"
            name="amount"
            min="0"
            required
            placeholder="0.00"
            defaultValue={defaults.amount}
          />
        </Field>

        <Field label="Date" htmlFor="date">
          <Input
            id="date"
            name="date"
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            required
          />
        </Field>

        <Field
          label={type === "transfer" ? "From account" : "Account"}
          htmlFor="accountId"
        >
          <NativeSelect
            id="accountId"
            name="accountId"
            required
            value={accountId}
            onChange={(e) => handleAccountChange(e.target.value)}
          >
            <option value="" disabled>
              Select…
            </option>
            {sourceAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </NativeSelect>
        </Field>

        {type === "transfer" && (
          <Field label="To account" htmlFor="destinationAccountId">
            <NativeSelect
              id="destinationAccountId"
              name="destinationAccountId"
              required
              value={destinationAccountId}
              onChange={(e) => handleDestinationChange(e.target.value)}
            >
              <option value="" disabled>
                Select…
              </option>
              {destinationAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}

        {type !== "transfer" && (
          <Field label="Category" htmlFor="categoryId">
            <NativeSelect
              id="categoryId"
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {relevantCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}

        {type !== "transfer" && subcategories.length > 0 && (
          <Field label="Subcategory (optional)" htmlFor="subcategoryId">
            <NativeSelect
              id="subcategoryId"
              name="subcategoryId"
              defaultValue={defaults.subcategoryId}
            >
              <option value="">—</option>
              {subcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}

        <Field label="Tag (optional)" htmlFor="tagId">
          <NativeSelect
            id="tagId"
            name="tagId"
            defaultValue={defaults.tagId}
          >
            <option value="">—</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Description (optional)" htmlFor="description">
          <Input
            id="description"
            type="text"
            name="description"
            maxLength={500}
            defaultValue={defaults.description}
          />
        </Field>

        <div className="flex items-center gap-2 pt-4">
          <Button type="submit">{submitLabel}</Button>
          <Button asChild variant="ghost">
            <Link href="/">Cancel</Link>
          </Button>
        </div>
      </form>
    </FormPage>
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
    <div role="tablist" className="flex gap-1">
      {options.map((t) => (
        <Button
          key={t}
          role="tab"
          type="button"
          aria-selected={value === t}
          variant={value === t ? "default" : "outline"}
          onClick={() => onChange(t)}
          className="flex-1 capitalize"
        >
          {t}
        </Button>
      ))}
    </div>
  );
}
