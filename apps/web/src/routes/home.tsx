import { ActionIcon, AppShell, Button, Group, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { AccountsSidebar } from "@/features/accounts/accounts-sidebar";
import { TransactionsList } from "@/features/transactions/transactions-list";
import { listAccounts } from "@/lib/endpoints";

export function HomeRoute() {
  const [params] = useSearchParams();
  const accountId = params.get("account") ?? undefined;
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const accountName = accountId
    ? accountsQ.data?.find((a) => a.id === accountId)?.name
    : undefined;

  return (
    <AppShell header={{ height: 50 }} navbar={{ width: 400, breakpoint: 100 }}>
      <AppShell.Header>
        <Group h="100%" justify="space-between" px="sm">
          <Group>
            <Title order={4}>{accountName ?? "All transactions"}</Title>
            {accountName && (
              <ActionIcon aria-label="Clear filter" component={Link} to="/">
                <X />
              </ActionIcon>
            )}
          </Group>
          <Button component={Link} size="sm" to="/transactions/new">
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
