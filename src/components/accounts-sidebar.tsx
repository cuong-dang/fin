import Link from "next/link";
import { Plus } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountGroups, accounts, transactionLegs } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import type { CurrentSession } from "@/lib/session";
import { SignOutForm } from "./sign-out-form";

type AccountRow = {
  id: string;
  name: string;
  currency: string;
  accountGroupId: string;
  balance: string;
};

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
        name: accounts.name,
        currency: accounts.currency,
        accountGroupId: accounts.accountGroupId,
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

  const byGroup = new Map<string, AccountRow[]>();
  for (const a of accountsRows) {
    const list = byGroup.get(a.accountGroupId) ?? [];
    list.push(a);
    byGroup.set(a.accountGroupId, list);
  }

  return { groups, byGroup };
}

export async function AccountsSidebar({
  session,
}: {
  session: CurrentSession;
}) {
  if (!session.groupId) return null;
  const { groups, byGroup } = await fetchSidebarData(session.groupId);

  return (
    <aside className="flex w-72 flex-col border-r border-zinc-200 dark:border-zinc-800">
      <SidebarHeader />
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          groups.map((g) => (
            <AccountGroupSection
              key={g.id}
              name={g.name}
              items={byGroup.get(g.id) ?? []}
            />
          ))
        )}
      </div>
      <SidebarFooter session={session} />
    </aside>
  );
}

// ─── Sub-components (file-local) ──────────────────────────────────────────

function SidebarHeader() {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-3">
      <h2 className="text-xs font-semibold tracking-wide uppercase text-zinc-500">
        Accounts
      </h2>
      <Link
        href="/accounts/new"
        aria-label="New account"
        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <Plus className="h-4 w-4" />
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="px-4 py-6 text-sm text-zinc-500">
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
}: {
  name: string;
  items: AccountRow[];
}) {
  return (
    <section className="px-4 py-2">
      <h3 className="py-1 text-xs font-medium text-zinc-400">{name}</h3>
      {items.length === 0 ? (
        <p className="py-1 pl-2 text-sm text-zinc-400 italic">empty</p>
      ) : (
        <ul className="space-y-1">
          {items.map((a) => (
            <AccountItem key={a.id} {...a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountItem({ name, currency, balance }: AccountRow) {
  return (
    <li className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
      <span>{name}</span>
      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
        {formatMoney(BigInt(balance), currency)}
      </span>
    </li>
  );
}

function SidebarFooter({ session }: { session: CurrentSession }) {
  return (
    <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 text-xs text-zinc-500">
        {session.name} ({session.email})
      </div>
      <SignOutForm />
    </div>
  );
}
