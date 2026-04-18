import Link from "next/link";
import { Plus, X } from "lucide-react";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AccountsSidebar } from "@/components/accounts-sidebar";
import { TransactionsList } from "@/components/transactions-list";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";

const accountParam = z.uuid().optional().catch(undefined);

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const params = await searchParams;
  const accountId = accountParam.parse(params.account);

  let accountName: string | undefined;
  if (accountId && session.groupId) {
    const [row] = await db
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    accountName = row?.name;
  }

  return (
    <div className="flex h-full">
      <AccountsSidebar session={session} selectedAccountId={accountId} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">
              {accountName ?? "All transactions"}
            </h1>
            {accountName && (
              <Link
                href="/"
                aria-label="Clear filter"
                className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </Link>
            )}
          </div>
          <Link
            href="/transactions/new"
            className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            <Plus className="h-4 w-4" />
            New transaction
          </Link>
        </header>
        <div className="flex-1 overflow-y-auto">
          <TransactionsList
            session={session}
            accountId={accountId}
            accountName={accountName}
          />
        </div>
      </main>
    </div>
  );
}
