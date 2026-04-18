"use client";

import Link from "next/link";
import { useState } from "react";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { createTransaction } from "./actions";

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

type TxType = "income" | "expense" | "transfer";

// Local-time YYYY-MM-DD for the date input's default.
function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Match date input's YYYY-MM-DD back to a timestamp: now-time if it's today,
// else local midnight. Client-side so it respects the browser's timezone.
function computeTimestamp(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const now = new Date();
  const isToday =
    y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate();
  if (isToday) return now;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function NewTransactionForm({
  accounts,
  categories,
  tags,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  tags: TagOption[];
}) {
  const [type, setType] = useState<TxType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [dateStr, setDateStr] = useState(todayISODate());

  const relevantCategories =
    type === "transfer" ? [] : categories.filter((c) => c.kind === type);
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const subcategories = selectedCategory?.subcategories ?? [];

  function handleTypeChange(newType: TxType) {
    setType(newType);
    setCategoryId(""); // previous category may belong to wrong kind
  }

  async function handleSubmit(formData: FormData) {
    formData.set("type", type);
    formData.set("timestamp", computeTimestamp(dateStr).toISOString());
    await createTransaction(formData);
  }

  if (accounts.length === 0) {
    return (
      <FormPage size="lg">
        <h1 className="text-2xl font-semibold">New transaction</h1>
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
      <h1 className="mt-4 text-2xl font-semibold">New transaction</h1>

      <form action={handleSubmit} className="mt-6 space-y-4">
        <TypeTabs value={type} onChange={handleTypeChange} />

        <Field label="Amount" htmlFor="amount">
          <Input
            id="amount"
            type="number"
            name="amount"
            step="any"
            min="0"
            required
            inputMode="decimal"
            placeholder="0.00"
          />
        </Field>

        <Field label="Date" htmlFor="date">
          <Input
            id="date"
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
            defaultValue=""
          >
            <option value="" disabled>
              Select…
            </option>
            {accounts.map((a) => (
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
              defaultValue=""
            >
              <option value="" disabled>
                Select…
              </option>
              {accounts.map((a) => (
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
              defaultValue=""
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
          <NativeSelect id="tagId" name="tagId" defaultValue="">
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
          />
        </Field>

        <div className="flex items-center gap-2 pt-4">
          <Button type="submit">Create transaction</Button>
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
