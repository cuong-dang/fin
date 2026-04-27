import type { Account, AccountGroup } from "@fin/schemas";
import {
  ActionIcon,
  Anchor,
  Divider,
  Group,
  NavLink,
  Progress,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, SlidersHorizontal } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { SectionHeader } from "@/components/section-header";
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
      <Group justify="space-between">
        <Anchor component={Link} fw={700} to="/" underline="never">
          fin
        </Anchor>
        <Group>
          <ActionIcon
            aria-label="Manage accounts"
            component={Link}
            to="/accounts"
          >
            <Settings size={14} />
          </ActionIcon>
          <ActionIcon
            aria-label="New account"
            component={Link}
            to="/accounts/new"
          >
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
          <Text c="dimmed" size="sm">
            No accounts yet.
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

      <Group justify="space-between">
        <Stack gap={0}>
          <Text fw={500} size="xs">
            {meQ.data?.user.name}
          </Text>
          <Text c="dimmed" size="xs">
            {meQ.data?.user.email}
          </Text>
        </Stack>
        <Group>
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
    <Stack>
      <Group justify="space-between">
        <SectionHeader>{group.name}</SectionHeader>
        {subtotal && (
          <Text c="dimmed" ff="monospace" size="sm">
            {formatMoney(subtotal.amount, subtotal.currency)}
          </Text>
        )}
      </Group>
      {accounts.length === 0 ? (
        <Text c="dimmed" size="sm">
          No accounts yet.
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
  const isCc = account.type === "credit_card" && account.creditLimit;

  // Compose the label column ourselves so the credit-limit bar renders
  // inline beneath the name. NavLink's `children` slot is for nested
  // sub-NavLinks (collapsible), which isn't what we want here.
  // limitRemaining derives directly from creditLimit + availableBalance
  // (sum of all legs incl. pending) — no need for a server-side field.
  const label = isCc ? (
    <Stack>
      <Text size="sm">{account.name}</Text>
      <CreditLimitBar
        creditLimit={BigInt(account.creditLimit!)}
        currency={account.currency}
        limitRemaining={BigInt(account.creditLimit!) + available}
      />
    </Stack>
  ) : (
    account.name
  );

  return (
    <NavLink
      active={active}
      component={Link}
      label={label}
      rightSection={
        <Stack align="flex-end">
          <Text c="dimmed" ff="monospace" size="sm">
            {formatMoney(present, account.currency)}
          </Text>
          {hasPending && !isCc && (
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

function CreditLimitBar({
  creditLimit,
  limitRemaining,
  currency,
}: {
  creditLimit: bigint;
  limitRemaining: bigint;
  currency: string;
}) {
  // limitRemaining can go negative (over-limit); clamp display only.
  const clamped = limitRemaining < 0n ? 0n : limitRemaining;
  const pctRemaining =
    creditLimit > 0n ? Number((clamped * 100n) / creditLimit) : 0;
  // Green when most of the limit is free; shifts red as it depletes.
  const color =
    pctRemaining >= 75 ? "teal" : pctRemaining >= 50 ? "yellow" : "red";

  return (
    <Stack>
      <Progress color={color} size="sm" value={pctRemaining} />
      <Text c="dimmed" ff="monospace" size="xs">
        {formatMoney(limitRemaining, currency)} of{" "}
        {formatMoney(creditLimit, currency)} left
      </Text>
    </Stack>
  );
}
