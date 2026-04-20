import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { groupBy } from "@/lib/collections";
import {
  deleteAccount,
  deleteAccountGroup,
  listAccountGroups,
  listAccounts,
} from "@/lib/endpoints";
import type { Account, AccountGroup } from "@fin/schemas";

export function AccountsManageRoute() {
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const groups = groupsQ.data ?? [];
  const accounts = accountsQ.data ?? [];
  const byGroup = groupBy(accounts, (a) => a.accountGroupId);

  return (
    <FormPage size="lg">
      <BackLink to="/" />
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Manage accounts</h1>
        <Button asChild size="sm">
          <Link to="/accounts/new">New account</Link>
        </Button>
      </div>
      {groups.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">
          No account groups yet.{" "}
          <Link to="/accounts/new" className="hover:text-foreground underline">
            Create your first account
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              accounts={byGroup.get(g.id) ?? []}
            />
          ))}
        </div>
      )}
    </FormPage>
  );
}

function GroupSection({
  group,
  accounts,
}: {
  group: AccountGroup;
  accounts: Account[];
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteAccountGroup(group.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account-groups"] }),
    onError: (e) => alert((e as Error).message),
  });
  return (
    <section>
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-sm font-semibold tracking-wider uppercase">
          {group.name}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit group ${group.name}`}
          >
            <Link to={`/account-groups/${group.id}/edit`}>
              <Pencil />
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="icon-xs"
            aria-label={`Delete group ${group.name}`}
            onClick={() => {
              if (
                confirm(`Delete group "${group.name}"? This cannot be undone.`)
              ) {
                del.mutate();
              }
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm italic">
          No accounts.
        </p>
      ) : (
        <ul className="mt-2 divide-y">
          {accounts.map((a) => (
            <AccountRowItem key={a.id} account={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountRowItem({ account }: { account: Account }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteAccount(account.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => alert((e as Error).message),
  });
  return (
    <li className="flex items-center justify-between py-2">
      <div className="text-sm">
        <span className="font-medium">{account.name}</span>
        <span className="text-muted-foreground ml-2">{account.currency}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          asChild
          variant="ghost"
          size="icon-xs"
          aria-label={`Edit account ${account.name}`}
        >
          <Link to={`/accounts/${account.id}/edit`}>
            <Pencil />
          </Link>
        </Button>
        <Button
          variant="destructive"
          size="icon-xs"
          aria-label={`Delete account ${account.name}`}
          onClick={() => {
            if (
              confirm(
                `Delete account "${account.name}"? This cannot be undone.`,
              )
            ) {
              del.mutate();
            }
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
