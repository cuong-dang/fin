import type { Subscription } from "@fin/schemas";
import { Alert, Box, Button, Divider, Group, Stack, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import { PageShell } from "@/components/page-shell";
import {
  type InitialSubValues,
  SubscriptionForm,
} from "@/features/subscriptions/subscription-form";
import {
  cancelSubscription,
  deleteSubscription,
  getSubscription,
  listAccounts,
  listCategories,
  listTags,
  updateSubscription,
} from "@/lib/endpoints";
import { formatMoneyPlain } from "@/lib/money";

import { NotFoundRoute } from "./not-found";

export function SubscriptionEditRoute() {
  const { id } = useParams<{ id: string }>();
  const subQ = useQuery({
    queryKey: ["subscription", id],
    queryFn: () => getSubscription(id!),
    enabled: !!id,
  });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: listTags });

  if (
    subQ.isLoading ||
    accountsQ.isLoading ||
    categoriesQ.isLoading ||
    tagsQ.isLoading
  ) {
    return null;
  }
  if (subQ.error || !subQ.data) return <NotFoundRoute />;

  return (
    <Form
      accounts={accountsQ.data ?? []}
      categories={categoriesQ.data ?? []}
      sub={subQ.data}
      tags={tagsQ.data ?? []}
    />
  );
}

function Form({
  sub,
  accounts,
  categories,
  tags,
}: {
  sub: Subscription;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  categories: Awaited<ReturnType<typeof listCategories>>;
  tags: Awaited<ReturnType<typeof listTags>>;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  function go() {
    qc.invalidateQueries({ queryKey: ["subscriptions"] });
    qc.invalidateQueries({ queryKey: ["subscription", sub.id] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    navigate("/settings/subscriptions");
  }

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof updateSubscription>[1]) =>
      updateSubscription(sub.id, body),
    onSuccess: go,
  });
  const cancel = useMutation({
    mutationFn: () => cancelSubscription(sub.id),
    onSuccess: go,
    onError: (e) => alert((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => deleteSubscription(sub.id),
    onSuccess: go,
    onError: (e) => alert((e as Error).message),
  });

  const initial = deriveInitial(sub);
  const cancelled = sub.cancelledAt !== null;

  return (
    <PageShell
      back="/settings/subscriptions"
      subtitle={cancelled ? `Cancelled ${sub.cancelledAt}` : undefined}
      title="Edit subscription"
    >
      {cancelled && (
        <Alert color="black">
          This subscription has been cancelled. Past transactions still
          reference it; editing here updates future projections only.
        </Alert>
      )}
      <SubscriptionForm
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
        cancelDisabled={cancelled}
        onCancel={() => {
          if (
            confirm(
              "Cancel this subscription? Past transactions stay attached; future projections stop.",
            )
          ) {
            cancel.mutate();
          }
        }}
        onDelete={() => {
          if (
            confirm(
              "Delete this subscription? Past transactions become unlinked but are preserved. This cannot be undone.",
            )
          ) {
            del.mutate();
          }
        }}
      />
    </PageShell>
  );
}

function DangerZone({
  cancelDisabled,
  onCancel,
  onDelete,
}: {
  cancelDisabled: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <Box mt="xl">
      <Divider mb="xs" />
      <Stack>
        <Text fw={700} size="sm">
          Danger zone
        </Text>
        <Text c="dimmed" size="sm">
          Cancelling stops future projections; past charges stay linked.
          Deleting unlinks past charges and removes the subscription entirely.
        </Text>
        <Group>
          <Button
            color="orange"
            disabled={cancelDisabled}
            variant="light"
            w="fit-content"
            onClick={onCancel}
          >
            Cancel subscription
          </Button>
          <Button
            color="red"
            variant="light"
            w="fit-content"
            onClick={onDelete}
          >
            Delete subscription
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}

function deriveInitial(sub: Subscription): InitialSubValues {
  return {
    name: sub.name,
    currency: sub.currency,
    frequency: sub.frequency,
    firstChargeDate: sub.firstChargeDate,
    defaultAccountId: sub.defaultAccountId ?? "",
    description: sub.description ?? "",
    lines: sub.defaultLines.map((l) => ({
      amount: formatMoneyPlain(BigInt(l.amount), l.currency),
      categoryId: l.categoryId,
      newCategoryName: "",
      subcategoryId: l.subcategoryId ?? "",
      newSubcategoryName: "",
      tags: l.tags.map((t) => t.name),
    })),
  };
}
