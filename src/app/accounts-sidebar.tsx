import Link from "next/link";
import { Plus, Settings, SlidersHorizontal } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  accountGroups,
  accounts,
  transactionLegs,
  transactions,
} from "@/db/schema";
import { groupBy } from "@/lib/collections";
import { formatMoney } from "@/lib/money";
import type { CurrentSession } from "@/lib/session";
import { SignOutForm } from "@/components/sign-out-form";

type AccountRow = {
  id: string;
  accountGroupId: string;
  name: string;
  currency: string;
  // Sum of legs whose transaction is settled (date IS NOT NULL). What the
  // account actually reflects right now.
  presentBalance: string;
  // Sum of all legs including pending. What the account will reflect once
  // pending transactions settle.
  availableBalance: string;
};

/**
 * If every account in the list shares one currency, return their summed
 * present balance for display. Returns null for mixed-currency groups — we
 * don't attempt FX conversion.
 */
function groupSubtotal(
  items: AccountRow[],
): { amount: bigint; currency: string } | null {
  if (items.length === 0) return null;
  const currency = items[0].currency;
  if (items.some((i) => i.currency !== currency)) return null;
  const total = items.reduce((sum, i) => sum + BigInt(i.presentBalance), 0n);
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
        presentBalance:
          sql<string>`COALESCE(SUM(${transactionLegs.amount}) FILTER (WHERE ${transactions.date} IS NOT NULL), 0)`.as(
            "present_balance",
          ),
        availableBalance:
          sql<string>`COALESCE(SUM(${transactionLegs.amount}), 0)`.as(
            "available_balance",
          ),
      })
      .from(accounts)
      .leftJoin(transactionLegs, eq(transactionLegs.accountId, accounts.id))
      .leftJoin(
        transactions,
        eq(transactions.id, transactionLegs.transactionId),
      )
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
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex w-72 flex-col border-r">
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
      <div className="flex items-center">
        <Button
          asChild
          variant="ghost"
          size="icon-xs"
          aria-label="Manage accounts"
        >
          <Link href="/accounts">
            <Settings />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon-xs" aria-label="New account">
          <Link href="/accounts/new">
            <Plus />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function AllAccountsLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/"
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

function EmptyState() {
  return (
    <p className="text-muted-foreground px-2 py-4 text-sm">
      No accounts yet.{" "}
      <Link
        href="/accounts/new"
        className="hover:text-sidebar-foreground underline"
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
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {name}
      </h3>
      {subtotal && (
        <span className="text-muted-foreground text-[11px] tabular-nums">
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
    return (
      <p className="text-muted-foreground px-2 py-1 text-sm italic">empty</p>
    );
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
  const present = BigInt(account.presentBalance);
  const available = BigInt(account.availableBalance);
  const hasPending = present !== available;
  return (
    <li>
      <Link
        href={`/?account=${account.id}`}
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

function SidebarFooter({ session }: { session: CurrentSession }) {
  return (
    <div className="border-sidebar-border flex items-center justify-between gap-2 border-t px-4 py-3">
      <div className="min-w-0 text-xs">
        <div className="truncate font-medium">{session.name}</div>
        <div className="text-muted-foreground truncate">{session.email}</div>
      </div>
      <div className="flex items-center">
        <Button asChild variant="ghost" size="icon-xs" aria-label="Settings">
          <Link href="/settings">
            <SlidersHorizontal />
          </Link>
        </Button>
        <SignOutForm />
      </div>
    </div>
  );
}
