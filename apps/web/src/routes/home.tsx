import { AccountsSidebar } from "@/features/accounts/accounts-sidebar";
import { TransactionsList } from "@/features/transactions/transactions-list";
import { listAccounts } from "@/lib/endpoints";
import { ActionIcon, AppShell, Button, Group, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Link, useSearchParams } from "react-router";

export function HomeRoute() {
  const [params] = useSearchParams();
  const accountId = params.get("account") ?? undefined;
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const accountName = accountId
    ? accountsQ.data?.find((a) => a.id === accountId)?.name
    : undefined;

  return (
    <AppShell navbar={{ width: 400, breakpoint: 100 }} header={{ height: 50 }}>
      <AppShell.Header>
        <Group justify="space-between" h="100%" px="sm">
          <Group>
            <Title order={4}>{accountName ?? "All transactions"}</Title>
            {accountName && (
              <ActionIcon component={Link} to="/" aria-label="Clear filter">
                <X />
              </ActionIcon>
            )}
          </Group>
          <Button component={Link} to="/transactions/new" size="sm">
            New transaction
          </Button>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar>
        <AccountsSidebar />
      </AppShell.Navbar>
      <AppShell.Main>
        <TransactionsList accountId={accountId} />
      </AppShell.Main>
    </AppShell>
  );
}
