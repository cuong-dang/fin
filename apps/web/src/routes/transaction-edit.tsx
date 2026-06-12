import { DangerZone } from "@/components/danger-zone";
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
  listBills,
  listCategories,
  listTags,
  updateAdjustmentTransaction,
  updateTransaction,
} from "@/lib/endpoints";
import { formatMoneyPlain } from "@/lib/money";

import type {
  EnrichedTransaction,
  TransactionsListResponse,
} from "@fin/schemas";
import { Alert, Button, Group, Stack, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { NotFoundRoute } from "./not-found";

export function TransactionEditRoute() {
  const navigate = useNavigate();
  const goBack = () => navigate(-1);
  const { id } = useParams<{ id: string }>();
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
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });
  const billsQ = useQuery({
    queryKey: ["bills"],
    queryFn: listBills,
  });

  if (
    txQ.isLoading ||
    accountsQ.isLoading ||
    categoriesQ.isLoading ||
    billsQ.isLoading
  ) {
    return null;
  }
  if (txQ.error || !txQ.data) return <NotFoundRoute />;
  const tx = txQ.data;

  function go() {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
    goBack();
  }

  if (tx.type === "adjustment") {
    return <AdjustmentEdit tx={tx} />;
  }
  if (tx.type === "refund") {
    return <RefundView tx={tx} />;
  }

  return (
    <FullEdit
      accounts={accountsQ.data ?? []}
      bills={billsQ.data ?? []}
      categories={categoriesQ.data ?? []}
      tags={tagsQ.data ?? []}
      tx={tx}
    />
  );

  function FullEdit(props: {
    tx: EnrichedTransaction;
    accounts: Awaited<ReturnType<typeof listAccounts>>;
    bills: Awaited<ReturnType<typeof listBills>>;
    categories: Awaited<ReturnType<typeof listCategories>>;
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

    const canRefund = props.tx.type === "expense" && props.tx.date !== null;

    return (
      <PageShell title="Edit transaction" withBackLink={false}>
        <TransactionForm
          accounts={props.accounts}
          bills={props.bills}
          categories={props.categories}
          error={mutation.error ? (mutation.error as Error).message : null}
          extraActions={
            canRefund ? (
              <Button
                color="teal"
                component={Link}
                to={`/transactions/${props.tx.id}/refund`}
                variant="light"
              >
                Refund
              </Button>
            ) : null
          }
          initialValues={initial}
          pending={mutation.isPending}
          submitLabel="Save"
          tags={props.tags}
          onCancel={goBack}
          onSubmit={(body) => mutation.mutate(body)}
        />
        <DangerZone description="Deleting removes this transaction along with its legs and lines.">
          <Button
            color="red"
            variant="light"
            w="fit-content"
            onClick={() => {
              if (
                confirm(
                  "Delete this transaction? Its legs and lines will be removed. This cannot be undone.",
                )
              ) {
                del.mutate();
              }
            }}
          >
            Delete transaction
          </Button>
        </DangerZone>
      </PageShell>
    );
  }

  function RefundView({ tx }: { tx: EnrichedTransaction }) {
    // Refunds are read-only post-create in v1. UX simplification, not
    // an analytics requirement: editing would need TransactionForm to
    // learn `type: 'refund'` and surface the (immutable)
    // `refundedTransactionId`. Refunds are typically small + few, so
    // delete-and-recreate is fine for now.
    const del = useMutation({
      mutationFn: () => deleteTransaction(tx.id),
      onSuccess: go,
      onError: (e) => alert((e as Error).message),
    });
    return (
      <PageShell title="Refund">
        <Stack>
          <Alert color="blue">
            Refund transactions are read-only. Delete and create a new refund if
            changes are needed.
          </Alert>
          <DangerZone description="Deleting removes this refund and its leg/lines. The original transaction is unaffected.">
            <Button
              color="red"
              variant="light"
              w="fit-content"
              onClick={() => {
                if (confirm("Delete this refund? This cannot be undone.")) {
                  del.mutate();
                }
              }}
            >
              Delete refund
            </Button>
          </DangerZone>
        </Stack>
      </PageShell>
    );
  }

  function AdjustmentEdit({ tx }: { tx: EnrichedTransaction }) {
    const leg = tx.legs[0];
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
      <PageShell title="Edit transaction" withBackLink={false}>
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
              <Button variant="subtle" onClick={goBack}>
                Cancel
              </Button>
            </Group>
          </Stack>
        </form>
        <DangerZone description="Deleting removes this transaction along with its legs and lines.">
          <Button
            color="red"
            variant="light"
            w="fit-content"
            onClick={() => {
              if (confirm("Delete this transaction? This cannot be undone.")) {
                del.mutate();
              }
            }}
          >
            Delete transaction
          </Button>
        </DangerZone>
      </PageShell>
    );
  }
}

function deriveInitial(tx: EnrichedTransaction): InitialTxValues {
  // Three things determine the form tab:
  //   - bill-linked expense → Payment > Bill
  //   - transfer landing on a CC → Payment > Credit card
  //   - transfer landing on a loan → Payment > Loan (lines carry interest/fees)
  //   - everything else tracks tx.type
  // Adjustments are handled upstream; the fallback to "expense" is just
  // defensive.
  let formType: InitialTxValues["type"];
  let paymentKind: InitialTxValues["paymentKind"];
  if (tx.billId) {
    formType = "payment";
    paymentKind = "bill";
  } else if (tx.type === "transfer") {
    const inLeg = tx.legs.find((l) => BigInt(l.amount) > 0n);
    if (inLeg?.accountType === "credit_card") {
      formType = "payment";
      paymentKind = "creditCard";
    } else if (inLeg?.accountType === "loan") {
      formType = "payment";
      paymentKind = "loan";
    } else {
      formType = "transfer";
    }
  } else if (tx.type === "adjustment" || tx.type === "refund") {
    // Adjustments and refunds are routed to their own dedicated views
    // upstream (`AdjustmentEdit`, `RefundView`) and never reach this
    // form. The fallback to "expense" is defensive — picking a real
    // `TxType` so the form would still render rather than crashing.
    formType = "expense";
  } else {
    formType = tx.type;
  }
  const base: InitialTxValues = {
    type: formType,
    paymentKind,
    date: tx.date ?? "",
    pending: tx.date === null,
    description: tx.description ?? "",
    accountId: "",
    destinationAccountId: "",
    transferAmount: "",
    lines: [],
    billId: tx.billId ?? "",
  };
  if (tx.type === "transfer") {
    const outLeg = tx.legs.find((l) => BigInt(l.amount) < 0n);
    const inLeg = tx.legs.find((l) => BigInt(l.amount) > 0n);
    if (!outLeg || !inLeg) {
      throw new Error(`Invariant: transfer ${tx.id} missing in/out leg`);
    }
    return {
      ...base,
      // Use |outLeg| (cash leaving the source), not inLeg. For loan
      // payments the destination leg carries only the principal
      // portion (= payment − Σ fee/interest lines), so prefilling
      // from inLeg would seed the wrong amount and re-subtract the
      // lines on save. For pure transfers, |outLeg| === inLeg, so
      // this is a no-op in the common case.
      transferAmount: formatMoneyPlainFromRaw(
        (-BigInt(outLeg.amount)).toString(),
        outLeg.accountCurrency,
      ),
      accountId: outLeg.accountId,
      destinationAccountId: inLeg.accountId,
      lines: tx.lines.map((line) => ({
        amount: formatMoneyPlainFromRaw(line.amount, line.currency),
        categoryId: line.categoryId,
        newCategoryName: "",
        subcategoryId: line.subcategoryId ?? "",
        newSubcategoryName: "",
        tagNames: line.tags.map((t) => t.name),
      })),
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
      tagNames: line.tags.map((t) => t.name),
    })),
    accountId: leg.accountId,
  };
}

function formatMoneyPlainFromRaw(raw: string, currency: string): string {
  return formatMoneyPlain(BigInt(raw), currency);
}
