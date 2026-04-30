import type { Bill } from "@fin/schemas";
import { Alert, Box, Button, Divider, Group, Stack, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import { PageShell } from "@/components/page-shell";
import { BillForm, type InitialBillValues } from "@/features/bills/bill-form";
import {
  cancelBill,
  deleteBill,
  getBill,
  listAccounts,
  listCategories,
  listTags,
  resumeBill,
  updateBill,
} from "@/lib/endpoints";
import { formatMoneyPlain } from "@/lib/money";

import { NotFoundRoute } from "./not-found";

export function BillEditRoute() {
  const { id } = useParams<{ id: string }>();
  const billQ = useQuery({
    queryKey: ["bill", id],
    queryFn: () => getBill(id!),
    enabled: !!id,
  });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });

  if (
    billQ.isLoading ||
    accountsQ.isLoading ||
    categoriesQ.isLoading ||
    tagsQ.isLoading
  ) {
    return null;
  }
  if (billQ.error || !billQ.data) return <NotFoundRoute />;

  return (
    <Form
      accounts={accountsQ.data ?? []}
      bill={billQ.data}
      categories={categoriesQ.data ?? []}
      tags={tagsQ.data ?? []}
    />
  );
}

function Form({
  bill,
  accounts,
  categories,
  tags,
}: {
  bill: Bill;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  categories: Awaited<ReturnType<typeof listCategories>>;
  tags: Awaited<ReturnType<typeof listTags>>;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  function go() {
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["bill", bill.id] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    navigate("/settings/bills");
  }

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof updateBill>[1]) =>
      updateBill(bill.id, body),
    onSuccess: go,
  });
  const cancel = useMutation({
    mutationFn: () => cancelBill(bill.id),
    onSuccess: go,
    onError: (e) => alert((e as Error).message),
  });
  const resume = useMutation({
    mutationFn: () => resumeBill(bill.id),
    onSuccess: go,
    onError: (e) => alert((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => deleteBill(bill.id),
    onSuccess: go,
    onError: (e) => alert((e as Error).message),
  });

  const initial = deriveInitial(bill);
  const cancelled = bill.cancelledAt !== null;

  return (
    <PageShell
      back="/settings/bills"
      subtitle={cancelled ? `Cancelled ${bill.cancelledAt}` : undefined}
      title="Edit bill"
    >
      {cancelled && (
        <Alert color="black">
          This bill has been cancelled. Past transactions still reference it;
          editing here updates future projections only.
        </Alert>
      )}
      <BillForm
        accounts={accounts}
        categories={categories}
        error={mutation.error ? (mutation.error as Error).message : null}
        initialValues={initial}
        pending={mutation.isPending}
        submitLabel="Save"
        tags={tags}
        onSubmit={(body) => mutation.mutate(body)}
      />
      <DangerZone
        cancelled={cancelled}
        onCancel={() => {
          if (
            confirm(
              "Cancel this bill? Past transactions stay attached; future projections stop.",
            )
          ) {
            cancel.mutate();
          }
        }}
        onDelete={() => {
          if (
            confirm(
              "Delete this bill? Past transactions become unlinked but are preserved. This cannot be undone.",
            )
          ) {
            del.mutate();
          }
        }}
        onResume={() => resume.mutate()}
      />
    </PageShell>
  );
}

function DangerZone({
  cancelled,
  onCancel,
  onResume,
  onDelete,
}: {
  cancelled: boolean;
  onCancel: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  return (
    <Box mt="xl">
      <Divider mb="xs" />
      <Stack>
        <Text fw={600}>Danger zone</Text>
        <Text c="dimmed">
          Cancelling stops future projections; past charges stay linked.
          Deleting unlinks past charges and removes the bill entirely.
        </Text>
        <Group>
          {cancelled ? (
            <Button
              color="teal"
              variant="light"
              w="fit-content"
              onClick={onResume}
            >
              Resume bill
            </Button>
          ) : (
            <Button
              color="orange"
              variant="light"
              w="fit-content"
              onClick={onCancel}
            >
              Cancel bill
            </Button>
          )}
          <Button
            color="red"
            variant="light"
            w="fit-content"
            onClick={onDelete}
          >
            Delete bill
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}

function deriveInitial(bill: Bill): InitialBillValues {
  return {
    name: bill.name,
    type: bill.type,
    currency: bill.currency,
    frequency: bill.frequency,
    defaultAccountId: bill.defaultAccountId ?? "",
    description: bill.description ?? "",
    lines: bill.defaultLines.map((l) => ({
      amount: l.amount ? formatMoneyPlain(BigInt(l.amount), l.currency) : "",
      categoryId: l.categoryId,
      newCategoryName: "",
      subcategoryId: l.subcategoryId ?? "",
      newSubcategoryName: "",
      tagNames: l.tags.map((t) => t.name),
    })),
  };
}
