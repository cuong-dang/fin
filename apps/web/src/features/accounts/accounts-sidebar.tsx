import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, SlidersHorizontal } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { groupBy } from "@/lib/collections";
import { listAccountGroups, listAccounts, me } from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";
import { SignOutButton } from "./sign-out-button";
import type { Account, AccountGroup } from "@fin/schemas";

export function AccountsSidebar() {
  const [params] = useSearchParams();
  const selectedAccountId = params.get("account") ?? undefined;
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });
  const meQ = useQuery({ queryKey: ["me"], queryFn: me });

  const groups = groupsQ.data ?? [];
  const accounts = accountsQ.data ?? [];
  const byGroup = groupBy(accounts, (a) => a.accountGroupId);

  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex w-72 flex-col border-r">
      <div className="flex items-center px-4 pt-4 pb-3">
        <Link to="/" className="text-base font-semibold tracking-tight">
          fin
        </Link>
      </div>
      <div className="flex items-center justify-between px-4 pb-2">
        <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          Accounts
        </h2>
        <div className="flex items-center">
          <Button
            asChild
            variant="ghost"
            size="icon-xs"
            aria-label="Manage accounts"
          >
            <Link to="/accounts">
              <Settings />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon-xs"
            aria-label="New account"
          >
            <Link to="/accounts/new">
              <Plus />
            </Link>
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <AllAccountsLink active={!selectedAccountId} />
        {groups.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-sm">
            No accounts yet.{" "}
            <Link
              to="/accounts/new"
              className="hover:text-sidebar-foreground underline"
            >
              Create one
            </Link>
            .
          </p>
        ) : (
          groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              accounts={byGroup.get(g.id) ?? []}
              selectedAccountId={selectedAccountId}
            />
          ))
        )}
      </div>
      <div className="border-sidebar-border flex items-center justify-between gap-2 border-t px-4 py-3">
        <div className="min-w-0 text-xs">
          {meQ.isLoading ? (
            <div className="text-muted-foreground italic">Loading…</div>
          ) : meQ.error ? (
            <div className="text-destructive">
              {(meQ.error as Error).message}
            </div>
          ) : (
            <>
              <div className="truncate font-medium">
                {meQ.data?.user.name ?? "(unknown)"}
              </div>
              <div className="text-muted-foreground truncate">
                {meQ.data?.user.email ?? ""}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center">
          <Button asChild variant="ghost" size="icon-xs" aria-label="Settings">
            <Link to="/settings">
              <SlidersHorizontal />
            </Link>
          </Button>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

function AllAccountsLink({ active }: { active: boolean }) {
  return (
    <Link
      to="/"
      className={`block rounded-md px-2 py-1.5 text-sm ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      }`}
    >
      All accounts
    </Link>
  );
}

function groupSubtotal(
  items: Account[],
): { amount: bigint; currency: string } | null {
  if (items.length === 0) return null;
  const currency = items[0].currency;
  if (items.some((i) => i.currency !== currency)) return null;
  const total = items.reduce((sum, i) => sum + BigInt(i.presentBalance), 0n);
  return { amount: total, currency };
}

function GroupSection({
  group,
  accounts,
  selectedAccountId,
}: {
  group: AccountGroup;
  accounts: Account[];
  selectedAccountId: string | undefined;
}) {
  const subtotal = groupSubtotal(accounts);
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between px-2 pb-1">
        <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          {group.name}
        </h3>
        {subtotal && (
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {formatMoney(subtotal.amount, subtotal.currency)}
          </span>
        )}
      </div>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground px-2 py-1 text-sm italic">empty</p>
      ) : (
        <ul className="space-y-0.5">
          {accounts.map((a) => (
            <AccountItem
              key={a.id}
              account={a}
              active={a.id === selectedAccountId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountItem({
  account,
  active,
}: {
  account: Account;
  active: boolean;
}) {
  const present = BigInt(account.presentBalance);
  const available = BigInt(account.availableBalance);
  const hasPending = present !== available;
  return (
    <li>
      <Link
        to={`/?account=${account.id}`}
        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        }`}
      >
        <span className="truncate">{account.name}</span>
        <span className="flex flex-col items-end tabular-nums leading-tight">
          <span className="text-muted-foreground">
            {formatMoney(present, account.currency)}
          </span>
          {hasPending && (
            <span className="text-muted-foreground/60 text-[10px]">
              avail {formatMoney(available, account.currency)}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
