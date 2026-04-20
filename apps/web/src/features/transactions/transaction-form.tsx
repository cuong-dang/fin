import type {
  Account,
  CategoryWithSubs,
  Tag,
  TransactionBody,
} from "@fin/schemas";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { localDateKey } from "@/lib/dates";
import { CategorySelector, CREATE_NEW } from "./category-selector";

export type TxType = "income" | "expense" | "transfer";

export type InitialTxValues = {
  type: TxType;
  date: string; // "" when pending
  pending: boolean;
  amount: string;
  description: string;
  accountId: string;
  destinationAccountId: string;
  categoryId: string;
  subcategoryId: string;
  tagId: string;
};

/**
 * Shared form for creating and editing income / expense / transfer
 * transactions. Parent supplies an `onSubmit(body)` callback that hands
 * off to a mutation.
 */
export function TransactionForm({
  accounts,
  categories,
  tags,
  title,
  submitLabel,
  initialValues,
  onSubmit,
  pending,
  error,
}: {
  accounts: Account[];
  categories: CategoryWithSubs[];
  tags: Tag[];
  title: string;
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
  const [newCategoryName, setNewCategoryName] = useState("");
  const [subcategoryId, setSubcategoryId] = useState(defaults.subcategoryId);
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [accountId, setAccountId] = useState(defaults.accountId);
  const [destinationAccountId, setDestinationAccountId] = useState(
    defaults.destinationAccountId,
  );
  const [dateStr, setDateStr] = useState(
    defaults.date || localDateKey(new Date()),
  );
  const [isPending, setIsPending] = useState(defaults.pending);
  const [amount, setAmount] = useState(defaults.amount);
  const [description, setDescription] = useState(defaults.description);
  const [tagId, setTagId] = useState(defaults.tagId);

  const relevantCategories =
    type === "transfer" ? [] : categories.filter((c) => c.kind === type);
  const sourceAccounts = accounts.filter((a) => a.id !== destinationAccountId);
  const destinationAccounts = accounts.filter((a) => a.id !== accountId);

  function handleTypeChange(newType: TxType) {
    setType(newType);
    setCategoryId("");
    setSubcategoryId("");
    setNewCategoryName("");
    setNewSubcategoryName("");
  }

  function handleAccountChange(newId: string) {
    setAccountId(newId);
    if (destinationAccountId === newId) setDestinationAccountId("");
  }

  function handleDestinationChange(newId: string) {
    setDestinationAccountId(newId);
    if (accountId === newId) setAccountId("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const commonBase = {
      pending: isPending,
      date: isPending ? undefined : dateStr,
      amount,
      description: description || undefined,
      tagId: tagId || undefined,
    };

    if (type === "transfer") {
      onSubmit({
        type: "transfer",
        ...commonBase,
        accountId,
        destinationAccountId,
      });
      return;
    }

    const creatingCategory = categoryId === CREATE_NEW;
    onSubmit({
      type,
      ...commonBase,
      accountId,
      categoryId: creatingCategory ? undefined : categoryId || undefined,
      newCategoryName: creatingCategory ? newCategoryName : undefined,
      subcategoryId:
        creatingCategory || subcategoryId === CREATE_NEW
          ? undefined
          : subcategoryId || undefined,
      newSubcategoryName: creatingCategory
        ? newSubcategoryName || undefined
        : subcategoryId === CREATE_NEW
          ? newSubcategoryName
          : undefined,
    });
  }

  if (accounts.length === 0) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-4 text-sm">
          You need to create an account first.
        </p>
        <Button asChild className="mt-6">
          <Link to="/accounts/new">Create account</Link>
        </Button>
      </main>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TypeTabs value={type} onChange={handleTypeChange} />

      <Field label="Amount" htmlFor="amount">
        <MoneyInput
          id="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          required
          placeholder="0.00"
        />
      </Field>

      <div className="flex items-center gap-2">
        <input
          id="pending"
          type="checkbox"
          checked={isPending}
          onChange={(e) => setIsPending(e.target.checked)}
          className="border-input h-4 w-4 rounded"
        />
        <label htmlFor="pending" className="text-sm">
          Mark as pending (settles later)
        </label>
      </div>

      {!isPending && (
        <Field label="Date" htmlFor="date">
          <Input
            id="date"
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            required
          />
        </Field>
      )}

      <Field
        label={type === "transfer" ? "From account" : "Account"}
        htmlFor="accountId"
      >
        <NativeSelect
          id="accountId"
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
        <CategorySelector
          categories={relevantCategories}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
          newCategoryName={newCategoryName}
          onNewCategoryNameChange={setNewCategoryName}
          subcategoryId={subcategoryId}
          onSubcategoryChange={setSubcategoryId}
          newSubcategoryName={newSubcategoryName}
          onNewSubcategoryNameChange={setNewSubcategoryName}
        />
      )}

      <Field label="Tag (optional)" htmlFor="tagId">
        <NativeSelect
          id="tagId"
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
      </Field>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex items-center gap-2 pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link to="/">Cancel</Link>
        </Button>
      </div>
    </form>
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
