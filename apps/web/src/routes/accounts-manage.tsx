import type { Account, AccountGroup } from "@fin/schemas";
import { ActionIcon, Box, Button, Divider, Group, Stack, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { Link } from "react-router";

import { DestructiveIconButton } from "@/components/destructive-icon-button";
import { PageShell } from "@/components/page-shell";
import { SectionHeader } from "@/components/section-header";
import { groupBy } from "@/lib/collections";
import {
  deleteAccount,
  deleteAccountGroup,
  listAccountGroups,
  listAccounts,
} from "@/lib/endpoints";

export function AccountsManageRoute() {
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const groups = groupsQ.data ?? [];
  const accounts = accountsQ.data ?? [];
  const byGroup = groupBy(accounts, (a) => a.accountGroupId);

  return (
    <PageShell
      back="/"
      right={
        <Button component={Link} to="/accounts/new">
          New account
        </Button>
      }
      title="Manage accounts"
    >
      {groups.length === 0 ? (
        <Text c="dimmed" size="sm">
          No accounts.
        </Text>
      ) : (
        <Stack>
          {groups.map((g) => (
            <GroupSection
              key={g.id}
              accounts={byGroup.get(g.id) ?? []}
              group={g}
            />
          ))}
        </Stack>
      )}
    </PageShell>
  );
}

function GroupSection({
  group,
  accounts,
}: {
  group: AccountGroup;
  accounts: Account[];
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteAccountGroup(group.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account-groups"] }),
    onError: (e) => alert((e as Error).message),
  });
  return (
    <Box component="section">
      <Group justify="space-between">
        <SectionHeader>{group.name}</SectionHeader>
        <Group gap={0}>
          <ActionIcon
            aria-label={`Edit group ${group.name}`}
            component={Link}
            to={`/account-groups/${group.id}/edit`}
          >
            <Pencil size={14} />
          </ActionIcon>
          <DestructiveIconButton
            confirmMessage={`Delete group "${group.name}"? This cannot be undone.`}
            label={`Delete group ${group.name}`}
            onConfirm={() => del.mutate()}
          />
        </Group>
      </Group>

      <Divider />

      {accounts.length === 0 ? (
        <Text c="dimmed" py="sm" size="sm">
          No accounts.
        </Text>
      ) : (
        <Stack py="sm">
          {accounts.map((a) => (
            <AccountRowItem key={a.id} account={a} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function AccountRowItem({ account }: { account: Account }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteAccount(account.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => alert((e as Error).message),
  });

  return (
    <Group justify="space-between">
      <Text size="sm">
        <b>{account.name}</b>{" "}
        <Text c="dimmed" component="span">
          {account.currency}
        </Text>
      </Text>
      <Group gap={0}>
        <ActionIcon
          aria-label={`Edit account ${account.name}`}
          component={Link}
          to={`/accounts/${account.id}/edit`}
        >
          <Pencil size={14} />
        </ActionIcon>
        <DestructiveIconButton
          confirmMessage={`Delete account "${account.name}"? This cannot be undone.`}
          label={`Delete account ${account.name}`}
          onConfirm={() => del.mutate()}
        />
      </Group>
    </Group>
  );
}
