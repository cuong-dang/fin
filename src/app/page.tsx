import { eq } from "drizzle-orm";
import { z } from "zod";
import { AppShell, MainColumn, MainContent } from "@/components/layout";
import { AccountsSidebar } from "@/components/accounts-sidebar";
import { TransactionsList } from "@/components/transactions-list";
import { TransactionsPageHeader } from "@/components/transactions-page-header";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";

const accountParam = z.uuid().optional().catch(undefined);

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  // Session
  const session = await getCurrentSession();
  if (!session) return null;

  // Params
  const params = await searchParams;
  const accountId = accountParam.parse(params.account);

  let accountName: string | undefined;
  if (accountId) {
    const [row] = await db
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    accountName = row?.name;
  }

  return (
    <AppShell>
      <AccountsSidebar session={session} selectedAccountId={accountId} />
      <MainColumn>
        <TransactionsPageHeader accountName={accountName} />
        <MainContent>
          <TransactionsList
            session={session}
            accountId={accountId}
            accountName={accountName}
          />
        </MainContent>
      </MainColumn>
    </AppShell>
  );
}
