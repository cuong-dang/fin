import { DangerZone } from "@/components/danger-zone";
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

import type { Bill } from "@fin/schemas";
import { Alert, Button, Group } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

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

  // Save / Cancel / Back / Delete return to wherever the user came from
  // instead of dumping at /settings/bills. `navigate(-1)` pops one
  // history entry.
  const goBack = () => navigate(-1);
  function go() {
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["bill", bill.id] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    goBack();
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
    <PageShell title="Edit bill" withBackLink={false}>
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
        onCancel={goBack}
        onSubmit={(body) => mutation.mutate(body)}
      />
      <DangerZone description="Cancelling stops future projections; past charges stay linked. Deleting unlinks past charges and removes the bill entirely.">
        <Group>
          {cancelled ? (
            <Button
              color="teal"
              variant="light"
              w="fit-content"
              onClick={() => resume.mutate()}
            >
              Resume bill
            </Button>
          ) : (
            <Button
              color="orange"
              variant="light"
              w="fit-content"
              onClick={() => {
                if (
                  confirm(
                    "Cancel this bill? Past transactions stay attached; future projections stop.",
                  )
                ) {
                  cancel.mutate();
                }
              }}
            >
              Cancel bill
            </Button>
          )}
          <Button
            color="red"
            variant="light"
            w="fit-content"
            onClick={() => {
              if (
                confirm(
                  "Delete this bill? Past transactions become unlinked but are preserved. This cannot be undone.",
                )
              ) {
                del.mutate();
              }
            }}
          >
            Delete bill
          </Button>
        </Group>
      </DangerZone>
    </PageShell>
  );
}

function deriveInitial(bill: Bill): InitialBillValues {
  return {
    name: bill.name,
    type: bill.type,
    currency: bill.currency,
    frequency: bill.frequency,
    defaultPayFromAccountId: bill.defaultPayFromAccountId ?? "",
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
