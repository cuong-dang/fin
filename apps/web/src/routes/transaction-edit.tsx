import type {
  EnrichedTransaction,
  TransactionsListResponse,
} from "@fin/schemas";
import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { MoneyField } from "@/components/money-field";
import { PageShell } from "@/components/page-shell";
import {
  type InitialTxValues,
  TransactionForm,
} from "@/features/transactions/transaction-form";
import {
  deleteTransaction,
  getTransaction,
  listAccounts,
  listCategories,
  listSubscriptions,
  listTags,
  updateAdjustmentTransaction,
  updateTransaction,
} from "@/lib/endpoints";
import { formatMoneyPlain } from "@/lib/money";

import { NotFoundRoute } from "./not-found";

export function TransactionEditRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Seed the single-tx query from any cached list that happens to contain
  // this tx, so the page renders instantly when the user clicks through from
  // the list. Falls back to the single-tx GET when opened via direct URL or
  // when the tx is past the list's page limit.
  const txQ = useQuery({
    queryKey: ["transactions", id],
    queryFn: () => getTransaction(id!),
    enabled: !!id,
    initialData: () => {
      // The ["transactions"] prefix matches both list entries
      // (["transactions", { accountId }]) and other single-tx entries
      // (["transactions", someId]), so we structurally filter to just lists.
      for (const [, data] of qc.getQueriesData<TransactionsListResponse>({
        queryKey: ["transactions"],
      })) {
        if (!data || !("pending" in data) || !("completed" in data)) continue;
        const hit = [...data.pending, ...data.completed].find(
          (t) => t.id === id,
        );
        if (hit) return hit;
      }
      return undefined;
    },
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
  const subsQ = useQuery({
    queryKey: ["subscriptions"],
    queryFn: listSubscriptions,
  });

  if (
    txQ.isLoading ||
    accountsQ.isLoading ||
    categoriesQ.isLoading ||
    subsQ.isLoading
  ) {
    return null;
  }
  if (txQ.error || !txQ.data) return <NotFoundRoute />;
  const tx = txQ.data;

  if (tx.type === "adjustment") {
    return <AdjustmentEdit tx={tx} />;
  }

  return (
    <FullEdit
      accounts={accountsQ.data ?? []}
      categories={categoriesQ.data ?? []}
      subscriptions={subsQ.data ?? []}
      tags={tagsQ.data ?? []}
      tx={tx}
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
    subscriptions: Awaited<ReturnType<typeof listSubscriptions>>;
    tags: Awaited<ReturnType<typeof listTags>>;
  }) {
    const mutation = useMutation({
      mutationFn: (body: Parameters<typeof updateTransaction>[1]) =>
        updateTransaction(props.tx.id, body),
      onSuccess: go,
    });
    const del = useMutation({
      mutationFn: () => deleteTransaction(props.tx.id),
      onSuccess: go,
      onError: (e) => alert((e as Error).message),
    });

    const initial = deriveInitial(props.tx);

    return (
      <PageShell back="/" subtitle={props.tx.type} title="Edit transaction">
        <TransactionForm
          accounts={props.accounts}
          categories={props.categories}
          error={mutation.error ? (mutation.error as Error).message : null}
          initialValues={initial}
          pending={mutation.isPending}
          submitLabel="Save"
          subscriptions={props.subscriptions}
          tags={props.tags}
          onSubmit={(body) => mutation.mutate(body)}
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
      </PageShell>
    );
  }

  function AdjustmentEdit({ tx }: { tx: EnrichedTransaction }) {
    const leg = tx.legs[0];
    if (!leg) throw new Error(`Invariant: adjustment ${tx.id} has no leg`);
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
    });
    const del = useMutation({
      mutationFn: () => deleteTransaction(tx.id),
      onSuccess: go,
      onError: (e) => alert((e as Error).message),
    });

    return (
      <PageShell
        back="/"
        subtitle="Balance adjustment"
        title="Edit transaction"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <Stack>
            <MoneyField label="Amount" value={amount} onChange={setAmount} />
            <TextInput
              label="Date"
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <TextInput
              label="Description"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {mutation.error && (
              <Alert color="red">{(mutation.error as Error).message}</Alert>
            )}
            <Group>
              <Button loading={mutation.isPending} type="submit">
                Save
              </Button>
              <Button component={Link} to="/" variant="subtle">
                Cancel
              </Button>
            </Group>
          </Stack>
        </form>
        <DangerZone
          onDelete={() => {
            if (confirm("Delete this transaction? This cannot be undone.")) {
              del.mutate();
            }
          }}
        />
      </PageShell>
    );
  }
}

function DangerZone({ onDelete }: { onDelete: () => void }) {
  return (
    <Box mt="xl">
      <Divider mb="xs" />
      <Stack gap="xs">
        <Text fw={700} size="sm">
          Danger zone
        </Text>
        <Text c="dimmed" size="sm">
          Deleting removes this transaction along with its legs and lines.
        </Text>
        <Button color="red" variant="light" w="fit-content" onClick={onDelete}>
          Delete transaction
        </Button>
      </Stack>
    </Box>
  );
}

function deriveInitial(tx: EnrichedTransaction): InitialTxValues {
  // Sub-linked expenses land on the "Payment" UI tab; everything else
  // tracks the underlying tx type. Adjustments are handled by a separate
  // form upstream, so the fallback to "expense" is just defensive.
  const formType: InitialTxValues["type"] = tx.subscriptionId
    ? "payment"
    : tx.type === "adjustment"
      ? "expense"
      : tx.type;
  const base: InitialTxValues = {
    type: formType,
    date: tx.date ?? "",
    pending: tx.date === null,
    description: tx.description ?? "",
    accountId: "",
    destinationAccountId: "",
    transferAmount: "",
    lines: [],
    subscriptionId: tx.subscriptionId ?? "",
  };
  if (tx.type === "transfer") {
    const outLeg = tx.legs.find((l) => BigInt(l.amount) < 0n);
    const inLeg = tx.legs.find((l) => BigInt(l.amount) > 0n);
    if (!outLeg || !inLeg) {
      throw new Error(`Invariant: transfer ${tx.id} missing in/out leg`);
    }
    return {
      ...base,
      transferAmount: formatMoneyPlainFromRaw(
        inLeg.amount,
        inLeg.accountCurrency,
      ),
      accountId: outLeg.accountId,
      destinationAccountId: inLeg.accountId,
    };
  }
  const leg = tx.legs[0];
  if (!leg) throw new Error(`Invariant: ${tx.type} ${tx.id} has no leg`);
  if (tx.lines.length === 0) {
    throw new Error(`Invariant: ${tx.type} ${tx.id} has no line`);
  }
  return {
    ...base,
    lines: tx.lines.map((line) => ({
      amount: formatMoneyPlainFromRaw(line.amount, line.currency),
      categoryId: line.categoryId,
      newCategoryName: "",
      subcategoryId: line.subcategoryId ?? "",
      newSubcategoryName: "",
      tags: line.tags.map((t) => t.name),
    })),
    accountId: leg.accountId,
  };
}

function formatMoneyPlainFromRaw(raw: string, currency: string): string {
  return formatMoneyPlain(BigInt(raw), currency);
}
