import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { AppShell, MainColumn, MainContent } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { AccountsSidebar } from "@/features/accounts/accounts-sidebar";
import { TransactionsList } from "@/features/transactions/transactions-list";
import { listAccounts } from "@/lib/endpoints";

export function HomeRoute() {
  const [params] = useSearchParams();
  const accountId = params.get("account") ?? undefined;
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });
  const accountName = accountId
    ? accountsQ.data?.find((a) => a.id === accountId)?.name
    : undefined;

  return (
    <AppShell>
      <AccountsSidebar />
      <MainColumn>
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-1.5">
            <h1 className="text-lg font-semibold">
              {accountName ?? "All transactions"}
            </h1>
            {accountName && (
              <Button
                asChild
                variant="ghost"
                size="icon-xs"
                aria-label="Clear filter"
              >
                <Link to="/">
                  <X />
                </Link>
              </Button>
            )}
          </div>
          <Button asChild size="sm">
            <Link to="/transactions/new">
              <Plus />
              New transaction
            </Link>
          </Button>
        </header>
        <MainContent>
          <TransactionsList accountId={accountId} accountName={accountName} />
        </MainContent>
      </MainColumn>
    </AppShell>
  );
}
