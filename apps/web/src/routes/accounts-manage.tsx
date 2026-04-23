import type { Account, AccountGroup } from "@fin/schemas";
import {
  ActionIcon,
  Anchor,
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
    <Container size="md" py="xl">
      <Stack>
        <BackLink to="/" />
        <Group justify="space-between" align="baseline">
          <Title order={2}>Manage accounts</Title>
          <Button component={Link} to="/accounts/new" size="sm">
            New account
          </Button>
        </Group>
        {groups.length === 0 ? (
          <Text c="dimmed" size="sm">
            No account groups yet.{" "}
            <Anchor component={Link} to="/accounts/new">
              Create your first account
            </Anchor>
            .
          </Text>
        ) : (
          <Stack gap="xl">
            {groups.map((g) => (
              <GroupSection
                key={g.id}
                group={g}
                accounts={byGroup.get(g.id) ?? []}
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
      <Group justify="space-between" pb="xs">
        <Text size="sm" fw={600} tt="uppercase">
          {group.name}
        </Text>
        <Group gap={4}>
          <ActionIcon
            component={Link}
            to={`/account-groups/${group.id}/edit`}
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Edit group ${group.name}`}
          >
            <Pencil size={14} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            aria-label={`Delete group ${group.name}`}
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
      <Divider mb="xs" />
      {accounts.length === 0 ? (
        <Text c="dimmed" size="sm" fs="italic">
          No accounts.
        </Text>
      ) : (
        <Stack gap={0}>
          {accounts.map((a, i) => (
            <Box key={a.id}>
              {i > 0 && <Divider />}
              <AccountRowItem account={a} />
            </Box>
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
    <Group justify="space-between" py="xs">
      <Text size="sm">
        <b>{account.name}</b>{" "}
        <Text component="span" c="dimmed">
          {account.currency}
        </Text>
      </Text>
      <Group gap={4}>
        <ActionIcon
          component={Link}
          to={`/accounts/${account.id}/edit`}
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={`Edit account ${account.name}`}
        >
          <Pencil size={14} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          aria-label={`Delete account ${account.name}`}
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
