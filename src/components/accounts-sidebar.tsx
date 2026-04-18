import Link from "next/link";
import { Plus } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { accountGroups, accounts, transactionLegs } from "@/db/schema";
import { groupBy } from "@/lib/collections";
import { formatMoney } from "@/lib/money";
import type { CurrentSession } from "@/lib/session";
import { SignOutForm } from "./sign-out-form";

type AccountRow = {
  id: string;
  accountGroupId: string;
  name: string;
  currency: string;
  balance: string;
};

/**
 * If every account in the list shares one currency, return their summed
 * balance for display. Returns null for mixed-currency groups — we don't
 * attempt FX conversion.
 */
function groupSubtotal(
  items: AccountRow[],
): { amount: bigint; currency: string } | null {
  if (items.length === 0) return null;
  const currency = items[0].currency;
  if (items.some((i) => i.currency !== currency)) return null;
  const total = items.reduce((sum, i) => sum + BigInt(i.balance), 0n);
  return { amount: total, currency };
}

async function fetchSidebarData(workspaceGroupId: string) {
  const [groups, accountsRows] = await Promise.all([
    db
      .select()
      .from(accountGroups)
      .where(eq(accountGroups.groupId, workspaceGroupId))
      .orderBy(accountGroups.name),
    db
      .select({
        id: accounts.id,
        accountGroupId: accounts.accountGroupId,
        name: accounts.name,
        currency: accounts.currency,
        balance: sql<string>`COALESCE(SUM(${transactionLegs.amount}), 0)`.as(
          "balance",
        ),
      })
      .from(accounts)
      .leftJoin(transactionLegs, eq(transactionLegs.accountId, accounts.id))
      .where(eq(accounts.groupId, workspaceGroupId))
      .groupBy(accounts.id)
      .orderBy(accounts.name),
  ]);

  const byGroup = groupBy(accountsRows, (a) => a.accountGroupId);

  return { groups, byGroup };
}

export async function AccountsSidebar({
  session,
  selectedAccountId,
}: {
  session: CurrentSession;
  selectedAccountId: string | undefined;
}) {
  const { groups, byGroup } = await fetchSidebarData(session.groupId);

  return (
    <aside className="flex w-72 flex-col border-r border-zinc-200 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-900/40">
      <BrandHeader />
      <AccountsHeader />
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <AllAccountsLink active={!selectedAccountId} />
        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          groups.map((g) => (
            <AccountGroupSection
              key={g.id}
              name={g.name}
              items={byGroup.get(g.id) ?? []}
              selectedAccountId={selectedAccountId}
            />
          ))
        )}
      </div>
      <SidebarFooter session={session} />
    </aside>
  );
}

// ─── Sub-components (file-local) ──────────────────────────────────────────

function BrandHeader() {
  return (
    <div className="flex items-center px-4 pt-4 pb-3">
      <Link href="/" className="text-base font-semibold tracking-tight">
        fin
      </Link>
    </div>
  );
}

function AccountsHeader() {
  return (
    <div className="flex items-center justify-between px-4 pb-2">
      <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        Accounts
      </h2>
      <Button asChild variant="ghost" size="icon-xs" aria-label="New account">
        <Link href="/accounts/new">
          <Plus />
        </Link>
      </Button>
    </div>
  );
}

function AllAccountsLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/"
      className={`block rounded-md px-2 py-1.5 text-sm ${
        active
          ? "bg-zinc-200/70 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          : "text-zinc-700 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
      }`}
    >
      All accounts
    </Link>
  );
}

function EmptyState() {
  return (
    <p className="px-2 py-4 text-sm text-zinc-500">
      No accounts yet.{" "}
      <Link
        href="/accounts/new"
        className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        Create one
      </Link>
      .
    </p>
  );
}

function AccountGroupSection({
  name,
  items,
  selectedAccountId,
}: {
  name: string;
  items: AccountRow[];
  selectedAccountId: string | undefined;
}) {
  return (
    <section className="mt-4">
      <AccountGroupHeader name={name} subtotal={groupSubtotal(items)} />
      <AccountList items={items} selectedAccountId={selectedAccountId} />
    </section>
  );
}

function AccountGroupHeader({
  name,
  subtotal,
}: {
  name: string;
  subtotal: { amount: bigint; currency: string } | null;
}) {
  return (
    <div className="flex items-baseline justify-between px-2 pb-1">
      <h3 className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
        {name}
      </h3>
      {subtotal && (
        <span className="text-[11px] tabular-nums text-zinc-500">
          {formatMoney(subtotal.amount, subtotal.currency)}
        </span>
      )}
    </div>
  );
}

function AccountList({
  items,
  selectedAccountId,
}: {
  items: AccountRow[];
  selectedAccountId: string | undefined;
}) {
  if (items.length === 0) {
    return <p className="px-2 py-1 text-sm text-zinc-400 italic">empty</p>;
  }
  return (
    <ul className="space-y-0.5">
      {items.map((a) => (
        <AccountItem
          key={a.id}
          account={a}
          active={a.id === selectedAccountId}
        />
      ))}
    </ul>
  );
}

function AccountItem({
  account,
  active,
}: {
  account: AccountRow;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={`/?account=${account.id}`}
        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
          active
            ? "bg-zinc-200/70 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            : "text-zinc-700 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
        }`}
      >
        <span className="truncate">{account.name}</span>
        <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatMoney(BigInt(account.balance), account.currency)}
        </span>
      </Link>
    </li>
  );
}

function SidebarFooter({ session }: { session: CurrentSession }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="min-w-0 text-xs">
        <div className="truncate font-medium text-zinc-700 dark:text-zinc-300">
          {session.name}
        </div>
        <div className="truncate text-zinc-500">{session.email}</div>
      </div>
      <SignOutForm />
    </div>
  );
}
