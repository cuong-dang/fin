import { DestructiveIconButton } from "@/components/destructive-icon-button.js";
import { PageShell } from "@/components/page-shell.js";
import { SectionHeader } from "@/components/section-header.js";
import { groupBy } from "@/lib/collections.js";
import {
  deleteAccount,
  deleteAccountGroup,
  listAccountGroups,
  listAccounts,
  unarchiveAccount,
} from "@/lib/endpoints";

import type { Account, AccountGroup } from "@fin/schemas";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Pencil } from "lucide-react";
import { Link } from "react-router";

export function SettingsAccountsRoute() {
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const groups = groupsQ.data ?? [];
  const allAccounts = accountsQ.data ?? [];
  const active = allAccounts.filter((a) => a.archivedAt === null);
  const archived = allAccounts.filter((a) => a.archivedAt !== null);
  const byGroup = groupBy(active, (a) => a.accountGroupId);

  return (
    <PageShell
      right={
        <Button component={Link} to="/accounts/new">
          New account
        </Button>
      }
      title="Accounts"
    >
      {groups.length === 0 ? (
        <Text c="dimmed">No accounts.</Text>
      ) : (
        <Stack>
          {groups.map((g) => (
            <GroupSection
              key={g.id}
              accounts={byGroup.get(g.id) ?? []}
              group={g}
            />
          ))}
          {archived.length > 0 && <ArchivedSection accounts={archived} />}
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
        <Group>
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
        <Text c="dimmed">No accounts yet.</Text>
      ) : (
        <Stack>
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
      <Text>
        <b>{account.name}</b>{" "}
        <Text c="dimmed" component="span">
          {account.currency}
        </Text>
      </Text>
      <Group>
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

function ArchivedSection({ accounts }: { accounts: Account[] }) {
  return (
    <Box component="section">
      <SectionHeader>Archived</SectionHeader>
      <Divider />
      <Stack>
        {accounts.map((a) => (
          <ArchivedRow key={a.id} account={a} />
        ))}
      </Stack>
    </Box>
  );
}

function ArchivedRow({ account }: { account: Account }) {
  const qc = useQueryClient();
  const unarchive = useMutation({
    mutationFn: () => unarchiveAccount(account.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
    onError: (e) => alert((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => deleteAccount(account.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
    onError: (e) => alert((e as Error).message),
  });
  return (
    <Group justify="space-between">
      <Text c="dimmed">
        <b>{account.name}</b>{" "}
        <Text c="dimmed" component="span">
          {account.currency}
        </Text>
      </Text>
      <Group>
        <ActionIcon
          aria-label={`Unarchive ${account.name}`}
          loading={unarchive.isPending}
          onClick={() => unarchive.mutate()}
        >
          <ArchiveRestore size={14} />
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
