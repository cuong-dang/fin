import type { Account, AccountGroup } from "@fin/schemas";
import {
  ActionIcon,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { BackLink } from "@/components/back-link";
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
    <Container>
      <Stack>
        <BackLink to="/" />
        {/* Title + new account */}
        <Group justify="space-between">
          <Title order={2}>Manage accounts</Title>
          <Button component={Link} size="sm" to="/accounts/new">
            New account
          </Button>
        </Group>

        {/* Account groups */}
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
      </Stack>
    </Container>
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
      {/* Name + edit/delete */}
      <Group justify="space-between">
        <Text fw={700} size="sm" tt="uppercase">
          {group.name}
        </Text>
        <Group gap={0}>
          <ActionIcon
            aria-label={`Edit group ${group.name}`}
            component={Link}
            to={`/account-groups/${group.id}/edit`}
          >
            <Pencil size={14} />
          </ActionIcon>
          <ActionIcon
            aria-label={`Delete group ${group.name}`}
            color="red"
            onClick={() => {
              if (
                confirm(`Delete group "${group.name}"? This cannot be undone.`)
              ) {
                del.mutate();
              }
            }}
          >
            <Trash2 size={14} />
          </ActionIcon>
        </Group>
      </Group>

      <Divider />

      {/* Accounts */}
      {accounts.length === 0 ? (
        <Text c="dimmed" py="sm" size="sm">
          No accounts.
        </Text>
      ) : (
        <Stack py="sm">
          {accounts.map((a) => (
            <AccountRowItem account={a} />
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
        <ActionIcon
          aria-label={`Delete account ${account.name}`}
          color="red"
          onClick={() => {
            if (
              confirm(
                `Delete account "${account.name}"? This cannot be undone.`,
              )
            ) {
              del.mutate();
            }
          }}
        >
          <Trash2 size={14} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
