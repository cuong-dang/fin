import type { EnrichedTransaction } from "@fin/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import {
  type InitialTxValues,
  TransactionForm,
} from "@/features/transactions/transaction-form";
import {
  deleteTransaction,
  listAccounts,
  listCategories,
  listTags,
  listTransactions,
  updateAdjustmentTransaction,
  updateTransaction,
} from "@/lib/endpoints";
import { formatMoneyPlain } from "@/lib/money";

export function TransactionEditRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // The list endpoint returns full enrichment; reuse it so we don't add a
  // GET-by-id route just for this. The list covers pending + latest
  // completed which is enough for edit.
  const txsQ = useQuery({
    queryKey: ["transactions", { accountId: undefined }],
    queryFn: () => listTransactions(undefined),
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: listTags });

  const tx: EnrichedTransaction | undefined = txsQ.data
    ? [...txsQ.data.pending, ...txsQ.data.completed].find((t) => t.id === id)
    : undefined;

  if (txsQ.isLoading || accountsQ.isLoading || categoriesQ.isLoading) {
    return null;
  }
  if (!tx) {
    return (
      <FormPage>
        <BackLink to="/" />
        <p className="mt-4 text-sm">Transaction not found.</p>
      </FormPage>
    );
  }

  if (tx.type === "adjustment") {
    return <AdjustmentEdit tx={tx} />;
  }

  return (
    <FullEdit
      tx={tx}
      accounts={accountsQ.data ?? []}
      categories={categoriesQ.data ?? []}
      tags={tagsQ.data ?? []}
    />
  );

  function go() {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
    navigate("/");
  }

  function FullEdit(props: {
    tx: EnrichedTransaction;
    accounts: Awaited<ReturnType<typeof listAccounts>>;
    categories: Awaited<ReturnType<typeof listCategories>>;
    tags: Awaited<ReturnType<typeof listTags>>;
  }) {
    const [error, setError] = useState<string | null>(null);
    const mutation = useMutation({
      mutationFn: (body: Parameters<typeof updateTransaction>[1]) =>
        updateTransaction(props.tx.id, body),
      onSuccess: go,
      onError: (e) => setError((e as Error).message),
    });
    const del = useMutation({
      mutationFn: () => deleteTransaction(props.tx.id),
      onSuccess: go,
      onError: (e) => alert((e as Error).message),
    });

    const initial = deriveInitial(props.tx);

    return (
      <FormPage size="lg">
        <BackLink to="/" />
        <h1 className="mt-4 mb-1 text-2xl font-semibold">Edit transaction</h1>
        <p className="text-muted-foreground mb-6 text-sm capitalize">
          {props.tx.type}
        </p>
        <TransactionForm
          accounts={props.accounts}
          categories={props.categories}
          tags={props.tags}
          title="Edit transaction"
          submitLabel="Save"
          initialValues={initial}
          onSubmit={(body) => {
            setError(null);
            mutation.mutate(body);
          }}
          pending={mutation.isPending}
          error={error}
        />
        <DangerZone
          onDelete={() => {
            if (
              confirm(
                "Delete this transaction? Its legs and lines will be removed. This cannot be undone.",
              )
            ) {
              del.mutate();
            }
          }}
        />
      </FormPage>
    );
  }

  function AdjustmentEdit({ tx }: { tx: EnrichedTransaction }) {
    const leg = tx.legs[0];
    if (!leg) throw new Error(`Invariant: adjustment ${tx.id} has no leg`);
    const [error, setError] = useState<string | null>(null);
    const [amount, setAmount] = useState(
      formatMoneyPlain(BigInt(leg.amount), leg.accountCurrency),
    );
    const [date, setDate] = useState(tx.date ?? "");
    const [description, setDescription] = useState(tx.description ?? "");
    const mutation = useMutation({
      mutationFn: () =>
        updateAdjustmentTransaction(tx.id, {
          date,
          amount,
          description: description || undefined,
        }),
      onSuccess: go,
      onError: (e) => setError((e as Error).message),
    });
    const del = useMutation({
      mutationFn: () => deleteTransaction(tx.id),
      onSuccess: go,
      onError: (e) => alert((e as Error).message),
    });

    return (
      <FormPage>
        <BackLink to="/" />
        <h1 className="mt-4 text-2xl font-semibold">Edit transaction</h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">
          Balance adjustment
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Amount" htmlFor="amount">
            <MoneyInput
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Date" htmlFor="date">
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Description" htmlFor="description">
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
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button asChild variant="ghost">
              <Link to="/">Cancel</Link>
            </Button>
          </div>
        </form>
        <DangerZone
          onDelete={() => {
            if (confirm("Delete this transaction? This cannot be undone.")) {
              del.mutate();
            }
          }}
        />
      </FormPage>
    );
  }
}

function DangerZone({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="mt-12 border-t pt-6">
      <h2 className="text-sm font-semibold">Danger zone</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Deleting removes this transaction along with its legs and lines.
      </p>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="mt-3"
        onClick={onDelete}
      >
        Delete transaction
      </Button>
    </div>
  );
}

function deriveInitial(tx: EnrichedTransaction): InitialTxValues {
  const base: InitialTxValues = {
    type: tx.type === "adjustment" ? "expense" : tx.type,
    date: tx.date ?? "",
    pending: tx.date === null,
    amount: "",
    description: tx.description ?? "",
    accountId: "",
    destinationAccountId: "",
    categoryId: "",
    subcategoryId: "",
    tagId: "",
  };
  if (tx.type === "transfer") {
    const outLeg = tx.legs.find((l) => BigInt(l.amount) < 0n);
    const inLeg = tx.legs.find((l) => BigInt(l.amount) > 0n);
    if (!outLeg || !inLeg) throw new Error("Transfer missing in/out leg");
    return {
      ...base,
      amount: formatMoneyPlainFromRaw(inLeg.amount, inLeg.accountCurrency),
      accountId: outLeg.accountId,
      destinationAccountId: inLeg.accountId,
    };
  }
  const leg = tx.legs[0];
  const line = tx.lines[0];
  if (!leg) throw new Error("Missing leg");
  if (!line) throw new Error("Missing line");
  return {
    ...base,
    amount: formatMoneyPlainFromRaw(line.amount, line.currency),
    accountId: leg.accountId,
    categoryId: line.categoryId,
    subcategoryId: line.subcategoryId ?? "",
    tagId: line.tagId ?? "",
  };
}

function formatMoneyPlainFromRaw(raw: string, currency: string): string {
  return formatMoneyPlain(BigInt(raw), currency);
}
