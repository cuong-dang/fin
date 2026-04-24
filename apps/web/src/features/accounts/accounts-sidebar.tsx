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
    /* Title + settings/new */
    <Stack gap={0} h="100%">
      <Group justify="space-between" px="sm" py="sm">
        <Anchor component={Link} fw={700} to="/" underline="never">
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

      {/* Group + account list */}
      <ScrollArea flex={1}>
        <NavLink
          active={!selectedAccountId}
          component={Link}
          label="All accounts"
          to="/"
        />
        {groups.length === 0 ? (
          <Text c="dimmed" p="sm" size="sm">
            No accounts.
          </Text>
        ) : (
          groups.map((g) => (
            <GroupSection
              key={g.id}
              accounts={byGroup.get(g.id) ?? []}
              group={g}
              selectedAccountId={selectedAccountId}
            />
          ))
        )}
      </ScrollArea>

      <Divider />

      <Group justify="space-between" px="sm" py="sm">
        <Stack gap={0}>
          <Text fw={500} size="xs">
            {meQ.data?.user.name}
          </Text>
          <Text c="dimmed" size="xs">
            {meQ.data?.user.email}
          </Text>
        </Stack>
        <Group gap={0}>
          <ActionIcon aria-label="Settings" component={Link} to="/settings">
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
        <Text c="dimmed" fw={700} size="sm" tt="uppercase">
          {group.name}
        </Text>
        {subtotal && (
          <Text c="dimmed" ff="monospace" size="sm">
            {formatMoney(subtotal.amount, subtotal.currency)}
          </Text>
        )}
      </Group>
      {accounts.length === 0 ? (
        <Text c="dimmed" p="sm" size="sm">
          No accounts.
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
      active={active}
      component={Link}
      label={account.name}
      rightSection={
        <Stack align="flex-end" gap={0}>
          <Text c="dimmed" ff="monospace" size="sm">
            {formatMoney(present, account.currency)}
          </Text>
          {hasPending && (
            <Text c="dimmed" ff="monospace" size="sm">
              avail {formatMoney(available, account.currency)}
            </Text>
          )}
        </Stack>
      }
      to={`/?account=${account.id}`}
    />
  );
}
