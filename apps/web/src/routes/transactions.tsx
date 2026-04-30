import { ActionIcon, Group, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { TransactionsList } from "@/features/transactions/transactions-list";
import { listAccounts } from "@/lib/endpoints";

export function TransactionsRoute() {
  const [params] = useSearchParams();
  const accountId = params.get("account") ?? undefined;
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const accountName = accountId
    ? accountsQ.data?.find((a) => a.id === accountId)?.name
    : undefined;

  return (
    <>
      {accountName && (
        <Group p="xs">
          <Text c="dimmed">Filtered by:</Text>
          <Text fw={500}>{accountName}</Text>
          <ActionIcon
            aria-label="Clear filter"
            component={Link}
            to="/transactions"
          >
            <X size={14} />
          </ActionIcon>
        </Group>
      )}
      <TransactionsList accountId={accountId} />
    </>
  );
}
