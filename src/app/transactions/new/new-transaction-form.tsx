"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const SELECT_CLASS =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 block h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none";

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
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-semibold">New transaction</h1>
        <p className="text-muted-foreground mt-4 text-sm">
          You need to create an account first.
        </p>
        <Button asChild className="mt-6">
          <Link href="/accounts/new">Create account</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <Button asChild variant="link" size="sm" className="-ml-2.5 px-0">
        <Link href="/">← Back</Link>
      </Button>
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
          <select
            id="accountId"
            name="accountId"
            required
            defaultValue=""
            className={SELECT_CLASS}
          >
            <option value="" disabled>
              Select…
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </Field>

        {type === "transfer" && (
          <Field label="To account" htmlFor="destinationAccountId">
            <select
              id="destinationAccountId"
              name="destinationAccountId"
              required
              defaultValue=""
              className={SELECT_CLASS}
            >
              <option value="" disabled>
                Select…
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </Field>
        )}

        {type !== "transfer" && (
          <Field label="Category" htmlFor="categoryId">
            <select
              id="categoryId"
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className={SELECT_CLASS}
            >
              <option value="" disabled>
                Select…
              </option>
              {relevantCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {type !== "transfer" && subcategories.length > 0 && (
          <Field label="Subcategory (optional)" htmlFor="subcategoryId">
            <select
              id="subcategoryId"
              name="subcategoryId"
              defaultValue=""
              className={SELECT_CLASS}
            >
              <option value="">—</option>
              {subcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Tag (optional)" htmlFor="tagId">
          <select
            id="tagId"
            name="tagId"
            defaultValue=""
            className={SELECT_CLASS}
          >
            <option value="">—</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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
    </main>
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
    <div role="tablist" className="border-input flex rounded-md border">
      {options.map((t) => (
        <button
          key={t}
          role="tab"
          type="button"
          aria-selected={value === t}
          onClick={() => onChange(t)}
          className={`flex-1 px-3 py-2 text-sm capitalize first:rounded-l-md last:rounded-r-md ${
            value === t
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
