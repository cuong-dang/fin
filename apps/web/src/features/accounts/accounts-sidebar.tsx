import type { Account, AccountGroup } from "@fin/schemas";
import {
  ActionIcon,
  Anchor,
  Divider,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, SlidersHorizontal } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { groupBy } from "@/lib/collections";
import { listAccountGroups, listAccounts, me } from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";
import { SignOutButton } from "./sign-out-button";

export function AccountsSidebar() {
  const [params] = useSearchParams();
  const selectedAccountId = params.get("account") ?? undefined;
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const meQ = useQuery({ queryKey: ["me"], queryFn: me });

  const groups = groupsQ.data ?? [];
  const accounts = accountsQ.data ?? [];
  const byGroup = groupBy(accounts, (a) => a.accountGroupId);

  return (
    <Stack gap={0} h="100%">
      <Group justify="space-between" px="sm" py="sm">
        <Anchor component={Link} to="/" fw={700} underline="never">
          fin
        </Anchor>
        <Group gap={0}>
          <ActionIcon component={Link} to="/accounts">
            <Settings size={14} />
          </ActionIcon>
          <ActionIcon component={Link} to="/accounts/new">
            <Plus size={14} />
          </ActionIcon>
        </Group>
      </Group>

      <Divider />

      <ScrollArea flex={1}>
        <NavLink
          component={Link}
          to="/"
          label="All accounts"
          active={!selectedAccountId}
        />
        {groups.length === 0 ? (
          <Text size="sm" c="dimmed" px="sm" py="sm">
            No accounts.
          </Text>
        ) : (
          groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              accounts={byGroup.get(g.id) ?? []}
              selectedAccountId={selectedAccountId}
            />
          ))
        )}
      </ScrollArea>

      <Divider />

      <Group justify="space-between" px="sm" py="sm">
        <Stack gap={0}>
          <Text size="xs" fw={500}>
            {meQ.data?.user.name}
          </Text>
          <Text size="xs" c="dimmed">
            {meQ.data?.user.email}
          </Text>
        </Stack>
        <Group gap={0}>
          <ActionIcon component={Link} to="/settings" aria-label="Settings">
            <SlidersHorizontal size={14} />
          </ActionIcon>
          <SignOutButton />
        </Group>
      </Group>
    </Stack>
  );
}

function groupSubtotal(
  items: Account[],
): { amount: bigint; currency: string } | null {
  if (items.length === 0) return null;
  const currency = items[0].currency;
  if (items.some((i) => i.currency !== currency)) return null;
  const total = items.reduce((sum, i) => sum + BigInt(i.presentBalance), 0n);
  return { amount: total, currency };
}

function GroupSection({
  group,
  accounts,
  selectedAccountId,
}: {
  group: AccountGroup;
  accounts: Account[];
  selectedAccountId: string | undefined;
}) {
  const subtotal = groupSubtotal(accounts);
  return (
    <Stack gap={0} py="sm">
      <Group justify="space-between" px="sm">
        <Text size="sm" fw={700} c="dimmed" tt="uppercase">
          {group.name}
        </Text>
        {subtotal && (
          <Text size="sm" c="dimmed" ff="monospace">
            {formatMoney(subtotal.amount, subtotal.currency)}
          </Text>
        )}
      </Group>
      {accounts.length === 0 ? (
        <Text size="sm" c="dimmed" px="sm" py="sm">
          Empty.
        </Text>
      ) : (
        accounts.map((a) => (
          <AccountItem
            key={a.id}
            account={a}
            active={a.id === selectedAccountId}
          />
        ))
      )}
    </Stack>
  );
}

function AccountItem({
  account,
  active,
}: {
  account: Account;
  active: boolean;
}) {
  const present = BigInt(account.presentBalance);
  const available = BigInt(account.availableBalance);
  const hasPending = present !== available;

  return (
    <NavLink
      component={Link}
      to={`/?account=${account.id}`}
      active={active}
      label={account.name}
      rightSection={
        <Stack gap={0} align="flex-end">
          <Text size="sm" c="dimmed" ff="monospace">
            {formatMoney(present, account.currency)}
          </Text>
          {hasPending && (
            <Text size="sm" c="dimmed" ff="monospace">
              avail {formatMoney(available, account.currency)}
            </Text>
          )}
        </Stack>
      }
    />
  );
}
