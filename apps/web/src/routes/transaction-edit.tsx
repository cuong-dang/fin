import type { EnrichedTransaction } from "@fin/schemas";
import {
  Alert,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "@/components/back-link";
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
      <Container size="xs" py="xl">
        <Stack>
          <BackLink to="/" />
          <Text size="sm">Transaction not found.</Text>
        </Stack>
      </Container>
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
      <Container size="sm" py="xl">
        <Stack>
          <BackLink to="/" />
          <Box>
            <Title order={2}>Edit transaction</Title>
            <Text size="sm" c="dimmed" tt="capitalize">
              {props.tx.type}
            </Text>
          </Box>
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
        </Stack>
      </Container>
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
      <Container size="xs" py="xl">
        <Stack>
          <BackLink to="/" />
          <Box>
            <Title order={2}>Edit transaction</Title>
            <Text size="sm" c="dimmed">
              Balance adjustment
            </Text>
          </Box>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              mutation.mutate();
            }}
          >
            <Stack>
              <TextInput
                label="Amount"
                type="number"
                step="any"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <TextInput
                label="Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              <TextInput
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
              {error && <Alert color="red">{error}</Alert>}
              <Group>
                <Button type="submit" loading={mutation.isPending}>
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
        </Stack>
      </Container>
    );
  }
}

function DangerZone({ onDelete }: { onDelete: () => void }) {
  return (
    <Box mt="xl">
      <Divider mb="md" />
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          Danger zone
        </Text>
        <Text size="sm" c="dimmed">
          Deleting removes this transaction along with its legs and lines.
        </Text>
        <Button
          color="red"
          variant="light"
          size="sm"
          onClick={onDelete}
          w="fit-content"
        >
          Delete transaction
        </Button>
      </Stack>
    </Box>
  );
}

function deriveInitial(tx: EnrichedTransaction): InitialTxValues {
  const base: InitialTxValues = {
    type: tx.type === "adjustment" ? "expense" : tx.type,
    date: tx.date ?? "",
    pending: tx.date === null,
    description: tx.description ?? "",
    accountId: "",
    destinationAccountId: "",
    transferAmount: "",
    lines: [],
    tagId: "",
  };
  if (tx.type === "transfer") {
    const outLeg = tx.legs.find((l) => BigInt(l.amount) < 0n);
    const inLeg = tx.legs.find((l) => BigInt(l.amount) > 0n);
    if (!outLeg || !inLeg) throw new Error("Transfer missing in/out leg");
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
  if (!leg) throw new Error("Missing leg");
  if (tx.lines.length === 0) throw new Error("Missing line");
  return {
    ...base,
    lines: tx.lines.map((line) => ({
      amount: formatMoneyPlainFromRaw(line.amount, line.currency),
      categoryId: line.categoryId,
      newCategoryName: "",
      subcategoryId: line.subcategoryId ?? "",
      newSubcategoryName: "",
    })),
    accountId: leg.accountId,
    tagId: tx.lines[0].tagId ?? "",
  };
}

function formatMoneyPlainFromRaw(raw: string, currency: string): string {
  return formatMoneyPlain(BigInt(raw), currency);
}
