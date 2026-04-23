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
      <Group justify="space-between" px="md" py="sm">
        <Anchor component={Link} to="/" fw={600} underline="never">
          fin
        </Anchor>
        <Group gap={0}>
          <ActionIcon
            component={Link}
            to="/accounts"
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="Manage accounts"
          >
            <Settings size={14} />
          </ActionIcon>
          <ActionIcon
            component={Link}
            to="/accounts/new"
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="New account"
          >
            <Plus size={14} />
          </ActionIcon>
        </Group>
      </Group>
      <Divider />
      <ScrollArea flex={1} px="xs" pb="md">
        <NavLink
          component={Link}
          to="/"
          label="All accounts"
          active={!selectedAccountId}
        />
        {groups.length === 0 ? (
          <Text size="sm" c="dimmed" px="xs" py="md">
            No accounts yet.{" "}
            <Anchor component={Link} to="/accounts/new">
              Create one
            </Anchor>
            .
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
      <Group justify="space-between" gap="xs" px="md" py="sm">
        <Stack gap={0} style={{ minWidth: 0 }}>
          {meQ.isLoading ? (
            <Text size="xs" c="dimmed" fs="italic">
              Loading…
            </Text>
          ) : meQ.error ? (
            <Text size="xs" c="red">
              {(meQ.error as Error).message}
            </Text>
          ) : (
            <>
              <Text size="xs" fw={500} truncate>
                {meQ.data?.user.name ?? "(unknown)"}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {meQ.data?.user.email ?? ""}
              </Text>
            </>
          )}
        </Stack>
        <Group gap={0} wrap="nowrap">
          <ActionIcon
            component={Link}
            to="/settings"
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="Settings"
          >
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
    <Stack gap={2} mt="md">
      <Group justify="space-between" px="xs">
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {group.name}
        </Text>
        {subtotal && (
          <Text size="xs" c="dimmed" ff="monospace">
            {formatMoney(subtotal.amount, subtotal.currency)}
          </Text>
        )}
      </Group>
      {accounts.length === 0 ? (
        <Text size="sm" c="dimmed" fs="italic" px="xs">
          empty
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
          <Text size="xs" c="dimmed" ff="monospace">
            {formatMoney(present, account.currency)}
          </Text>
          {hasPending && (
            <Text size="xs" c="dimmed" ff="monospace">
              avail {formatMoney(available, account.currency)}
            </Text>
          )}
        </Stack>
      }
    />
  );
}
