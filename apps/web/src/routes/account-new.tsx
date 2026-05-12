import { PageShell } from "@/components/page-shell";
import { AccountForm } from "@/features/accounts/account-form";
import {
  createAccount,
  listAccountGroups,
  listAccounts,
  listCategories,
  listTags,
} from "@/lib/endpoints";

import { Alert } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

export function AccountNewRoute() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });

  const goBack = () => navigate(-1);
  const mutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      goBack();
    },
  });

  if (
    groupsQ.isLoading ||
    accountsQ.isLoading ||
    categoriesQ.isLoading ||
    tagsQ.isLoading
  ) {
    return null;
  }
  if (groupsQ.error || accountsQ.error || categoriesQ.error || tagsQ.error) {
    return <Alert color="red">Failed to load.</Alert>;
  }

  return (
    <PageShell title="New account">
      <AccountForm
        allAccounts={accountsQ.data ?? []}
        categories={categoriesQ.data ?? []}
        error={mutation.error ? (mutation.error as Error).message : null}
        groups={groupsQ.data ?? []}
        mode={{ kind: "new", onSubmit: (body) => mutation.mutate(body) }}
        pending={mutation.isPending}
        submitLabel="Create"
        tags={tagsQ.data ?? []}
        onCancel={goBack}
      />
    </PageShell>
  );
}
