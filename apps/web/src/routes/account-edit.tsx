import { PageShell } from "@/components/page-shell";
import {
  AccountForm,
  type InitialAccountValues,
} from "@/features/accounts/account-form";
import {
  getAccount,
  listAccountGroups,
  listAccounts,
  listCategories,
  listTags,
  updateAccount,
} from "@/lib/endpoints";
import { formatMoneyPlain } from "@/lib/money";

import type {
  Account,
  AccountGroup,
  CategoryWithSubs,
  Tag,
} from "@fin/schemas";
import { Alert } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import { NotFoundRoute } from "./not-found";

export function AccountEditRoute() {
  const { id } = useParams<{ id: string }>();
  const accountQ = useQuery({
    queryKey: ["account", id],
    queryFn: () => getAccount(id!),
    enabled: !!id,
  });
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

  if (
    accountQ.isLoading ||
    groupsQ.isLoading ||
    accountsQ.isLoading ||
    categoriesQ.isLoading ||
    tagsQ.isLoading
  ) {
    return null;
  }
  if (
    accountQ.error ||
    groupsQ.error ||
    accountsQ.error ||
    categoriesQ.error ||
    tagsQ.error
  ) {
    return <Alert color="red">Failed to load account.</Alert>;
  }
  if (!accountQ.data) return <NotFoundRoute />;

  return (
    <EditForm
      account={accountQ.data}
      allAccounts={accountsQ.data ?? []}
      categories={categoriesQ.data ?? []}
      groups={groupsQ.data ?? []}
      tags={tagsQ.data ?? []}
    />
  );
}

function EditForm({
  account,
  allAccounts,
  groups,
  categories,
  tags,
}: {
  account: Account;
  allAccounts: Account[];
  groups: AccountGroup[];
  categories: CategoryWithSubs[];
  tags: Tag[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const goBack = () => navigate(-1);

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof updateAccount>[1]) =>
      updateAccount(account.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account", account.id] });
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      goBack();
    },
  });

  const initialValues: InitialAccountValues = {
    type: account.type,
    name: account.name,
    currency: account.currency,
    accountGroupId: account.accountGroupId,
    newGroupName: "",
    balance: formatMoneyPlain(BigInt(account.presentBalance), account.currency),
    creditLimit: account.creditLimit
      ? formatMoneyPlain(BigInt(account.creditLimit), account.currency)
      : "",
    defaultPayFromAccountId: account.defaultPayFromAccountId ?? "",
    amountPerPeriod: account.loan
      ? formatMoneyPlain(BigInt(account.loan.amountPerPeriod), account.currency)
      : "",
    frequency: account.loan?.frequency ?? "monthly",
    loanLines: account.loan
      ? account.loan.defaultLines.map((l) => ({
          amount: l.amount
            ? formatMoneyPlain(BigInt(l.amount), account.currency)
            : "",
          categoryId: l.categoryId,
          newCategoryName: "",
          subcategoryId: l.subcategoryId ?? "",
          newSubcategoryName: "",
          tagNames: l.tags.map((t) => t.name),
        }))
      : [],
    excludeFromNetWorth: account.excludeFromNetWorth,
  };

  return (
    <PageShell title="Edit account" withBackLink={false}>
      <AccountForm
        allAccounts={allAccounts}
        categories={categories}
        error={mutation.error ? (mutation.error as Error).message : null}
        groups={groups}
        initialValues={initialValues}
        mode={{ kind: "edit", onSubmit: (body) => mutation.mutate(body) }}
        pending={mutation.isPending}
        submitLabel="Save"
        tags={tags}
        onCancel={goBack}
      />
    </PageShell>
  );
}
