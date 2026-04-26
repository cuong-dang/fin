import type { Account, AccountGroup } from "@fin/schemas";
import {
  Alert,
  Button,
  Group,
  NativeSelect,
  Stack,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { MoneyField } from "@/components/money-field";
import { PageShell } from "@/components/page-shell";
import { CREATE_NEW, GroupSelector } from "@/features/accounts/group-selector";
import { localDateKey } from "@/lib/dates";
import {
  getAccount,
  listAccountGroups,
  listAccounts,
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

  if (accountQ.isLoading || groupsQ.isLoading || accountsQ.isLoading)
    return null;
  if (accountQ.error || groupsQ.error || accountsQ.error) {
    return <Alert color="red">Failed to load account.</Alert>;
  }
  if (!accountQ.data) return <NotFoundRoute />;
  return (
    <Form
      account={accountQ.data}
      allAccounts={accountsQ.data!}
      groups={groupsQ.data!}
    />
  );
}

function Form({
  account,
  allAccounts,
  groups,
}: {
  account: Account;
  allAccounts: Account[];
  groups: AccountGroup[];
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

  const isCc = account.type === "credit_card";
  const checkingAccounts = allAccounts.filter(
    (a) => a.type === "checking_savings" && a.id !== account.id,
  );

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof updateAccount>[1]) =>
      updateAccount(account.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account", account.id] });
      qc.invalidateQueries({ queryKey: ["account-groups"] });
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
          if (isCc) {
            mutation.mutate({
              type: "credit_card",
              ...common,
              creditLimit,
              defaultPayFromAccountId: defaultPayFromAccountId || undefined,
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
            value={isCc ? "Credit card" : "Checking / savings"}
          />
          <GroupSelector
            groups={groups}
            newGroupName={newGroupName}
            value={groupId}
            onNewGroupNameChange={setNewGroupName}
            onValueChange={setGroupId}
          />
          {isCc && (
            <>
              <MoneyField
                label="Credit limit"
                min={0}
                value={creditLimit}
                onChange={setCreditLimit}
              />
              <NativeSelect
                data={[
                  { value: "", label: "— No default —" },
                  ...checkingAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${a.currency})`,
                  })),
                ]}
                description="Pre-fills the source account when paying this card."
                label="Default pay-from account (optional)"
                value={defaultPayFromAccountId}
                onChange={(e) => setDefaultPayFromAccountId(e.target.value)}
              />
            </>
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
