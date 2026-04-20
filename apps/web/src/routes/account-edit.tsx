import type { Account, AccountGroup } from "@fin/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { CREATE_NEW, GroupSelector } from "@/features/accounts/group-selector";
import { localDateKey } from "@/lib/dates";
import { getAccount, listAccountGroups, updateAccount } from "@/lib/endpoints";
import { formatMoney, formatMoneyPlain } from "@/lib/money";

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

  if (accountQ.isLoading || groupsQ.isLoading) return null;
  if (!accountQ.data) {
    return (
      <FormPage>
        <BackLink to="/accounts" />
        <p className="mt-4 text-sm">Account not found.</p>
      </FormPage>
    );
  }
  return <Form account={accountQ.data} groups={groupsQ.data ?? []} />;
}

function Form({
  account,
  groups,
}: {
  account: Account;
  groups: AccountGroup[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const initialBalance = formatMoneyPlain(
    BigInt(account.presentBalance),
    account.currency,
  );
  const [name, setName] = useState(account.name);
  const [groupValue, setGroupValue] = useState(account.accountGroupId);
  const [newGroupName, setNewGroupName] = useState("");
  const [balance, setBalance] = useState(initialBalance);

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
    <FormPage>
      <BackLink to="/accounts" />
      <h1 className="mt-4 text-2xl font-semibold">Edit account</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const creatingNew = groupValue === CREATE_NEW;
          mutation.mutate({
            name,
            accountGroupId: !creatingNew ? groupValue : undefined,
            newGroupName: creatingNew ? newGroupName : undefined,
            balance: balance !== initialBalance ? balance : undefined,
            adjustmentDate: localDateKey(new Date()),
          });
        }}
        className="mt-6 space-y-4"
      >
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            maxLength={100}
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Input id="currency" value={account.currency} disabled />
        </Field>
        <GroupSelector
          groups={groups}
          value={groupValue}
          onValueChange={setGroupValue}
          newGroupName={newGroupName}
          onNewGroupNameChange={setNewGroupName}
        />
        <Field label="Balance" htmlFor="balance">
          <MoneyInput
            id="balance"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Current:{" "}
            {formatMoney(BigInt(account.presentBalance), account.currency)}.
            Changing this records an adjustment transaction for the delta.
          </p>
        </Field>
        {mutation.error && (
          <p className="text-destructive text-sm">
            {(mutation.error as Error).message}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/accounts">Cancel</Link>
          </Button>
        </div>
      </form>
    </FormPage>
  );
}
