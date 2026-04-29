import type {
  Account,
  AccountGroup,
  CategoryWithSubs,
  RecurringFrequency,
  Tag,
} from "@fin/schemas";
import { Alert, Button, Group, Stack, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import {
  type CategoryLineFormValues,
  packCategoryLine,
} from "@/components/category-selector";
import { MoneyField } from "@/components/money-field";
import { PageShell } from "@/components/page-shell";
import {
  CcFields,
  LoanPlanFields,
} from "@/features/accounts/account-form-fields";
import { CREATE_NEW, GroupSelector } from "@/features/accounts/group-selector";
import { localDateKey } from "@/lib/dates";
import {
  getAccount,
  listAccountGroups,
  listAccounts,
  listCategories,
  listTags,
  updateAccount,
} from "@/lib/endpoints";
import { formatMoney, formatMoneyPlain } from "@/lib/money";

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
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: listTags });

  if (
    accountQ.isLoading ||
    groupsQ.isLoading ||
    accountsQ.isLoading ||
    categoriesQ.isLoading ||
    tagsQ.isLoading
  )
    return null;
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
    <Form
      account={accountQ.data}
      allAccounts={accountsQ.data!}
      categories={categoriesQ.data!}
      groups={groupsQ.data!}
      tags={tagsQ.data!}
    />
  );
}

function Form({
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

  const initialBalance = formatMoneyPlain(
    BigInt(account.presentBalance),
    account.currency,
  );
  const initialLimit = account.creditLimit
    ? formatMoneyPlain(BigInt(account.creditLimit), account.currency)
    : "";
  const [name, setName] = useState(account.name);
  const [groupId, setGroupId] = useState(account.accountGroupId);
  const [newGroupName, setNewGroupName] = useState("");
  const [balance, setBalance] = useState(initialBalance);
  const [creditLimit, setCreditLimit] = useState(initialLimit);
  const [defaultPayFromAccountId, setDefaultPayFromAccountId] = useState(
    account.defaultPayFromAccountId ?? "",
  );

  // Loan plan fields. Pre-fill from the embedded plan summary when the
  // account is type=loan. All editable plan fields are bundled on the
  // account response so this form doesn't need a second fetch.
  const [planAmountPerPeriod, setPlanAmountPerPeriod] = useState(
    account.recurringPlan
      ? formatMoneyPlain(
          BigInt(account.recurringPlan.amountPerPeriod),
          account.currency,
        )
      : "",
  );
  const [planFrequency, setPlanFrequency] = useState<RecurringFrequency>(
    account.recurringPlan?.frequency ?? "monthly",
  );
  const [planPayFromId, setPlanPayFromId] = useState(
    account.recurringPlan?.defaultAccountId ?? "",
  );
  const [planDescription, setPlanDescription] = useState(
    account.recurringPlan?.description ?? "",
  );
  const [planLines, setPlanLines] = useState<CategoryLineFormValues[]>(
    account.recurringPlan
      ? account.recurringPlan.defaultLines.map((l) => ({
          amount: l.amount
            ? formatMoneyPlain(BigInt(l.amount), l.currency)
            : "",
          categoryId: l.categoryId,
          newCategoryName: "",
          subcategoryId: l.subcategoryId ?? "",
          newSubcategoryName: "",
          tagNames: l.tags.map((t) => t.name),
        }))
      : [],
  );

  const isCc = account.type === "credit_card";
  const isLoan = account.type === "loan";
  const checkingAccounts = allAccounts.filter(
    (a) => a.type === "checking_savings" && a.id !== account.id,
  );
  // Loan default pay-from: any non-loan account (checking/savings or CC).
  const loanPayFromAccounts = allAccounts.filter(
    (a) => a.type !== "loan" && a.id !== account.id,
  );

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof updateAccount>[1]) =>
      updateAccount(account.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account", account.id] });
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      navigate("/accounts");
    },
  });

  return (
    <PageShell back="/accounts" title="Edit account">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const creatingNewGroup = groupId === CREATE_NEW;
          const common = {
            name,
            accountGroupId: creatingNewGroup ? undefined : groupId,
            newGroupName: creatingNewGroup ? newGroupName : undefined,
            newBalance: balance !== initialBalance ? balance : undefined,
            adjustmentDate: localDateKey(new Date()),
          };
          if (account.type === "credit_card") {
            mutation.mutate({
              type: "credit_card",
              ...common,
              creditLimit,
              defaultPayFromAccountId: defaultPayFromAccountId || undefined,
            });
          } else if (account.type === "loan") {
            mutation.mutate({
              type: "loan",
              ...common,
              recurringPlan: {
                amountPerPeriod: planAmountPerPeriod,
                frequency: planFrequency,
                defaultAccountId: planPayFromId || undefined,
                description: planDescription || undefined,
                defaultLines: planLines.map(packCategoryLine),
              },
            });
          } else {
            mutation.mutate({ type: "checking_savings", ...common });
          }
        }}
      >
        <Stack>
          <TextInput
            data-autofocus
            label="Name"
            maxLength={100}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextInput disabled label="Currency" value={account.currency} />
          <TextInput
            disabled
            label="Type"
            value={
              account.type === "credit_card"
                ? "Credit card"
                : account.type === "loan"
                  ? "Loan"
                  : "Checking / savings"
            }
          />
          <GroupSelector
            groups={groups}
            newGroupName={newGroupName}
            value={groupId}
            onNewGroupNameChange={setNewGroupName}
            onValueChange={setGroupId}
          />
          {isCc && (
            <CcFields
              creditLimit={creditLimit}
              defaultPayFromAccountId={defaultPayFromAccountId}
              payFromAccounts={checkingAccounts}
              setCreditLimit={setCreditLimit}
              setDefaultPayFromAccountId={setDefaultPayFromAccountId}
            />
          )}
          {isLoan && (
            <LoanPlanFields
              amountPerPeriod={planAmountPerPeriod}
              categories={categories}
              description={planDescription}
              frequency={planFrequency}
              lines={planLines}
              payFromAccounts={loanPayFromAccounts}
              payFromId={planPayFromId}
              setAmountPerPeriod={setPlanAmountPerPeriod}
              setDescription={setPlanDescription}
              setFrequency={setPlanFrequency}
              setLines={setPlanLines}
              setPayFromId={setPlanPayFromId}
              tags={tags}
            />
          )}
          <MoneyField
            description={`Current: ${formatMoney(BigInt(account.presentBalance), account.currency)}. Changing this records an adjustment transaction for the delta.`}
            label="Balance"
            value={balance}
            onChange={setBalance}
          />
          {mutation.error && (
            <Alert color="red">{(mutation.error as Error).message}</Alert>
          )}
          <Group>
            <Button loading={mutation.isPending} type="submit">
              Save
            </Button>
            <Button component={Link} to="/accounts" variant="subtle">
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>
    </PageShell>
  );
}
