"use client";

import Link from "next/link";
import { useState } from "react";
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

const inputClass =
  "block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";

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
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          You need to create an account first.
        </p>
        <Link
          href="/accounts/new"
          className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Create account
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← Back
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">New transaction</h1>

      <form action={handleSubmit} className="mt-6 space-y-4">
        {/* Type */}
        <div
          role="tablist"
          className="flex rounded-md border border-zinc-300 dark:border-zinc-700"
        >
          {(["expense", "income", "transfer"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={type === t}
              onClick={() => handleTypeChange(t)}
              className={`flex-1 px-3 py-2 text-sm capitalize first:rounded-l-md last:rounded-r-md ${
                type === t
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <Field label="Amount">
          <input
            type="number"
            name="amount"
            step="any"
            min="0"
            required
            inputMode="decimal"
            placeholder="0.00"
            className={inputClass}
          />
        </Field>

        <Field label="Date">
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            required
            className={inputClass}
          />
        </Field>

        <Field label={type === "transfer" ? "From account" : "Account"}>
          <select
            name="accountId"
            required
            defaultValue=""
            className={inputClass}
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
          <Field label="To account">
            <select
              name="destinationAccountId"
              required
              defaultValue=""
              className={inputClass}
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
          <Field label="Category">
            <select
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className={inputClass}
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
          <Field label="Subcategory (optional)">
            <select name="subcategoryId" defaultValue="" className={inputClass}>
              <option value="">—</option>
              {subcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Tag (optional)">
          <select name="tagId" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description (optional)">
          <input
            type="text"
            name="description"
            maxLength={500}
            className={inputClass}
          />
        </Field>

        <div className="flex items-center gap-2 pt-4">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Create transaction
          </button>
          <Link
            href="/"
            className="rounded-md px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
