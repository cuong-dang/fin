import type { Account, AccountGroup, RecurringFrequency } from "@fin/schemas";
import {
  ActionIcon,
  Divider,
  Group,
  NavLink,
  Progress,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router";

import { SectionHeader } from "@/components/section-header";
import { groupBy } from "@/lib/collections";
import { listAccountGroups, listAccounts } from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";

/**
 * Accounts panel rendered inside the AppLayout's navbar. Account links
 * always navigate to /transactions filtered by that account; "All
 * transactions" clears the filter. Active state only lights up when
 * we're on /transactions — other pages (Charts, etc.) leave all rows
 * inactive even though clicking them still works.
 */
export function AccountsSidebar() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const onTransactions = pathname === "/transactions";
  const selectedAccountId = onTransactions
    ? (params.get("account") ?? undefined)
    : undefined;
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  const groups = groupsQ.data ?? [];
  const accounts = accountsQ.data ?? [];
  const byGroup = groupBy(accounts, (a) => a.accountGroupId);

  return (
    // `mih={0}` lets this Stack shrink below its intrinsic content
    // height inside the navbar's flex column. Without it the default
    // `min-height: auto` on flex children pins the Stack to content
    // height and the ScrollArea below has no bounded height to scroll.
    <Stack flex={1} gap={0} mih={0}>
      <Group justify="space-between">
        <SectionHeader compact>Accounts</SectionHeader>
        <Group gap={0}>
          <ActionIcon
            aria-label="Manage accounts"
            component={Link}
            to="/accounts"
          >
            <Pencil size={14} />
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
      <ScrollArea flex={1}>
        <NavLink
          active={onTransactions && !selectedAccountId}
          component={Link}
          label="All transactions"
          to="/transactions"
        />
        {groups.length === 0 ? (
          <Text c="dimmed">No accounts yet.</Text>
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
    <Stack gap={0}>
      <Group justify="space-between">
        <SectionHeader>{group.name}</SectionHeader>
        {subtotal && (
          <Text c="dimmed" ff="monospace">
            {formatMoney(subtotal.amount, subtotal.currency)}
          </Text>
        )}
      </Group>
      {accounts.length === 0 ? (
        <Text c="dimmed">No accounts yet.</Text>
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
  const isLoan = account.type === "loan" && account.recurringPlan;

  // Compose the label column ourselves so the credit-limit bar / loan
  // remaining-payments hint render inline beneath the name. NavLink's
  // `children` slot is for nested sub-NavLinks (collapsible), which isn't
  // what we want here.
  let label: React.ReactNode = account.name;
  if (isCc) {
    label = (
      <Stack gap={0}>
        <Text>{account.name}</Text>
        <CreditLimitBar
          creditLimit={BigInt(account.creditLimit!)}
          currency={account.currency}
          limitRemaining={BigInt(account.creditLimit!) + available}
        />
      </Stack>
    );
  } else if (isLoan) {
    label = (
      <Stack gap={0}>
        <Text>{account.name}</Text>
        <LoanRemainingHint
          amountPerPeriod={BigInt(account.recurringPlan!.amountPerPeriod)}
          balance={available}
          currency={account.currency}
          frequency={account.recurringPlan!.frequency}
        />
      </Stack>
    );
  }

  return (
    <NavLink
      active={active}
      component={Link}
      label={label}
      rightSection={
        <Stack align="flex-end">
          <Text c="dimmed" ff="monospace">
            {formatMoney(present, account.currency)}
          </Text>
          {hasPending && !isCc && (
            <Text c="dimmed" ff="monospace">
              avail {formatMoney(available, account.currency)}
            </Text>
          )}
        </Stack>
      }
      to={`/transactions?account=${account.id}`}
    />
  );
}

const FREQUENCY_SUFFIX: Record<RecurringFrequency, string> = {
  weekly: "/wk",
  biweekly: "/2wk",
  monthly: "/mo",
  quarterly: "/qtr",
  yearly: "/yr",
};

function LoanRemainingHint({
  balance,
  amountPerPeriod,
  currency,
  frequency,
}: {
  /** Sum of all legs on the loan account (negative when there's debt). */
  balance: bigint;
  amountPerPeriod: bigint;
  currency: string;
  frequency: RecurringFrequency;
}) {
  // Loan balance convention: negative = debt remaining, 0 = paid off,
  // positive = overpaid (rare). The "remaining payments" approximation
  // ignores amortization (early payments are mostly interest) — fine for
  // a sidebar hint, prefixed with `~` to signal the approximation.
  if (balance >= 0n) {
    return (
      <Text c="dimmed" ff="monospace" size="xs">
        Paid off
      </Text>
    );
  }
  if (amountPerPeriod <= 0n) return null;
  const debt = -balance;
  // ceil(debt / amountPerPeriod), with a 1-cent tolerance: amortizing
  // loans' final installment commonly absorbs sub-cent rounding, so a
  // penny over a clean multiple is the same payment count, not one
  // more (e.g. $10.01 with $10/mo = 1 left, not 2).
  const remainder = debt % amountPerPeriod;
  const base = debt / amountPerPeriod;
  const remaining = remainder <= 1n ? (base === 0n ? 1n : base) : base + 1n;
  return (
    <Text c="dimmed" ff="monospace" size="xs">
      ~{Number(remaining)} left · {formatMoney(amountPerPeriod, currency)}
      {FREQUENCY_SUFFIX[frequency]}
    </Text>
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
