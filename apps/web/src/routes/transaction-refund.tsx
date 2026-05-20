import { MoneyField } from "@/components/money-field";
import { PageShell } from "@/components/page-shell";
import { primaryLabel } from "@/features/transactions/tx-display";
import { localDateKey } from "@/lib/dates";
import {
  createTransaction,
  getTransaction,
  listAccounts,
} from "@/lib/endpoints";
import { formatMoney, formatMoneyPlain } from "@/lib/money";

import type { EnrichedTransaction, TransactionBody } from "@fin/schemas";
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { NotFoundRoute } from "./not-found";

/**
 * Create a refund for an existing expense.
 *
 * The form is intentionally simpler than `TransactionForm`: refunds
 * always mirror the original's category lines, so the user only picks
 * how much of each line to refund (and the receiving account + date).
 * Categories/subcategories/tags are NOT editable here — keeping the
 * mirror keeps category-spending analytics tidy.
 */
export function TransactionRefundRoute() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams<{ id: string }>();

  const txQ = useQuery({
    queryKey: ["transactions", id],
    queryFn: () => getTransaction(id!),
    enabled: !!id,
  });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  if (txQ.isLoading || accountsQ.isLoading) return null;
  if (txQ.error || !txQ.data) return <NotFoundRoute />;
  const original = txQ.data;

  // Refund can only target a completed expense — guard at the route
  // boundary, since the server will reject anything else with 422.
  if (original.type !== "expense" || original.date === null) {
    return (
      <PageShell title="Refund">
        <Alert color="yellow">
          Only completed expense transactions can be refunded.
        </Alert>
      </PageShell>
    );
  }

  return (
    <RefundForm
      accounts={accountsQ.data ?? []}
      original={original}
      onCancel={() => navigate(-1)}
      onDone={() => {
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["accounts"] });
        navigate(-2); // tx list
      }}
    />
  );
}

function RefundForm({
  original,
  accounts,
  onCancel,
  onDone,
}: {
  original: EnrichedTransaction;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  onCancel: () => void;
  onDone: () => void;
}) {
  // Original payment-method account: the (single) leg of the expense.
  // Refund money flows back to it by default. The user can override
  // (e.g., a returned item refunded to a different card) via the
  // account picker.
  const originalLeg = original.legs[0];
  const [accountId, setAccountId] = useState(originalLeg.accountId);
  const [date, setDate] = useState(localDateKey(new Date()));
  const [isPending, setIsPending] = useState(false);
  const [description, setDescription] = useState(
    `Refund of ${primaryLabel(original) || "Untitled transaction"}`,
  );

  // One refund-amount input per original line, sharing the line's
  // category/subcategory/tags on submit. Initialized to the original
  // amount as a starting point (most common case is full refund).
  // The X button next to each input clears it to "0"; the submit
  // logic drops zero / empty lines.
  const [refundAmounts, setRefundAmounts] = useState<string[]>(() =>
    original.lines.map((l) => formatMoneyPlain(BigInt(l.amount), l.currency)),
  );

  const create = useMutation({
    mutationFn: (body: TransactionBody) => createTransaction(body),
    onSuccess: onDone,
  });

  const handleSubmit: ComponentProps<"form">["onSubmit"] = (e) => {
    e.preventDefault();
    // Build refund-line bodies, dropping any line the user zeroed out.
    // Each refund line mirrors the original's category + subcategory +
    // tags (refunds reverse the original's categorization).
    const lines = original.lines
      .map((l, i) => {
        const amount = refundAmounts[i]?.trim() ?? "";
        if (!amount || Number(amount) === 0) return null;
        return {
          amount,
          categoryId: l.categoryId,
          subcategoryId: l.subcategoryId ?? "",
          newCategoryName: "",
          newSubcategoryName: "",
          tagNames: l.tags.map((t) => t.name),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (lines.length === 0) {
      alert("Enter at least one refund amount.");
      return;
    }

    create.mutate({
      type: "refund",
      pending: isPending,
      ...(isPending ? {} : { date }),
      ...(description ? { description } : {}),
      accountId,
      lines,
      refundedTransactionId: original.id,
    });
  };

  return (
    <PageShell title="Create refund" withBackLink={false}>
      <form onSubmit={handleSubmit}>
        <Stack>
          <Card>
            <Stack gap={0}>
              <Text c="dimmed" size="sm">
                Refunding
              </Text>
              <Text fw={500}>
                {primaryLabel(original) || "Untitled transaction"}
              </Text>
              <Text c="dimmed" size="sm">
                {original.date} · {originalLeg.accountName} ·{" "}
                {formatMoney(
                  BigInt(originalLeg.amount),
                  originalLeg.accountCurrency,
                )}
              </Text>
            </Stack>
          </Card>

          <Select
            data={accounts.map((a) => ({ value: a.id, label: a.name }))}
            label="Refund to"
            value={accountId}
            onChange={(v) => v && setAccountId(v)}
          />

          <Checkbox
            checked={isPending}
            label="Pending — refund hasn't cleared yet"
            onChange={(e) => setIsPending(e.currentTarget.checked)}
          />
          {!isPending && (
            <TextInput
              label="Date"
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}

          <TextInput
            label="Description"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <Text fw={500}>Lines</Text>
          {original.lines.map((line, i) => (
            <Card key={i}>
              <Stack gap={0}>
                <Text fw={500}>
                  {line.categoryName}
                  {line.subcategoryName ? ` › ${line.subcategoryName}` : ""}
                </Text>
                {/*
                  Two columns. Each column is its own (label, input)
                  Stack so labels share a row at the top. The
                  Refund-amount column's input box sits in an inner
                  `align="center"` row alongside the X, so the X
                  centers against the input box specifically (not
                  against the whole label+input pair).
                */}
                <Group>
                  <Stack gap={0}>
                    <Text size="sm">Original</Text>
                    <TextInput
                      disabled
                      value={formatMoney(BigInt(line.amount), line.currency)}
                    />
                  </Stack>
                  <Stack gap={0}>
                    <Text size="sm">Refund amount</Text>
                    <Group>
                      <MoneyField
                        label=""
                        min={0}
                        value={refundAmounts[i] ?? ""}
                        onChange={(v) =>
                          setRefundAmounts((prev) =>
                            prev.map((p, j) => (j === i ? v : p)),
                          )
                        }
                      />
                      <ActionIcon
                        aria-label={`Skip refunding ${line.categoryName}`}
                        color="red"
                        variant="subtle"
                        onClick={() =>
                          setRefundAmounts((prev) =>
                            prev.map((p, j) => (j === i ? "0" : p)),
                          )
                        }
                      >
                        <X size={14} />
                      </ActionIcon>
                    </Group>
                  </Stack>
                </Group>
              </Stack>
            </Card>
          ))}

          {create.error && (
            <Alert color="red">{(create.error as Error).message}</Alert>
          )}
          <Group>
            <Button loading={create.isPending} type="submit">
              Create refund
            </Button>
            <Button variant="subtle" onClick={onCancel}>
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>
    </PageShell>
  );
}
