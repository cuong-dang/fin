import { SectionHeader } from "@/components/section-header";
import { groupBy } from "@/lib/collections";
import {
  archiveAccount,
  listAccountGroups,
  listAccounts,
} from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";

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
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronDown, ChevronRight, CircleOff } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

/**
 * Accounts panel rendered inside the AppLayout's navbar.
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
  // Filter archived accounts out of the sidebar.
  const accounts = (accountsQ.data ?? []).filter((a) => a.archivedAt === null);
  const byGroup = groupBy(accounts, (a) => a.accountGroupId);
  // Hide groups that have no active accounts.
  const visibleGroups = groups.filter((g) => byGroup.has(g.id));
  const netWorth = totalsByCurrency(
    accounts.filter((a) => !a.excludeFromNetWorth),
  );

  // Collapsed-group state, persisted to localStorage.
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });

  return (
    // `mih={0}` lets this Stack shrink below its intrinsic content
    // height inside the navbar's flex column. Without it the default
    // `min-height: auto` on flex children pins the Stack to content
    // height and the ScrollArea below has no bounded height to scroll.
    <Stack gap={0} mih={0}>
      {/* "Accounts" + net worth */}
      <Group justify="space-between" px="xs">
        <SectionHeader compact>Accounts</SectionHeader>
        <NetWorthSummary totals={netWorth} />
      </Group>
      <Divider />

      {/* Account groups and accounts */}
      <ScrollArea flex={1}>
        <NavLink
          active={onTransactions && !selectedAccountId}
          component={Link}
          label="All transactions"
          to="/transactions"
        />
        {groupsQ.isLoading || accountsQ.isLoading ? (
          <Text c="dimmed" px="xs">
            Loading...
          </Text>
        ) : visibleGroups.length === 0 ? (
          <Text c="dimmed" px="xs">
            No accounts yet.
          </Text>
        ) : (
          visibleGroups.map((g) => (
            <GroupSection
              key={g.id}
              accounts={byGroup.get(g.id)!}
              collapsed={collapsed.has(g.id)}
              group={g}
              selectedAccountId={selectedAccountId}
              onToggle={() => toggleCollapse(g.id)}
            />
          ))
        )}

        {(groupsQ.error || accountsQ.error) && (
          <Text c="red" px="xs">
            Error loading groups or accounts.
          </Text>
        )}
      </ScrollArea>
    </Stack>
  );
}

function NetWorthSummary({ totals }: { totals: Map<string, bigint> }) {
  if (totals.size === 0) return null;
  return (
    <Stack align="flex-end" gap={0}>
      {[...totals].map(([currency, amount]) => (
        <Text key={currency} ff="monospace">
          {formatMoney(amount, currency)}
        </Text>
      ))}
    </Stack>
  );
}

function GroupSection({
  group,
  accounts,
  selectedAccountId,
  collapsed,
  onToggle,
}: {
  group: AccountGroup;
  accounts: Account[];
  selectedAccountId: string | undefined;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const subtotal = groupSubtotal(accounts);
  return (
    <Stack gap={0}>
      <NavLink
        component={UnstyledButton}
        label={
          <Group>
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <SectionHeader compact>{group.name}</SectionHeader>
          </Group>
        }
        pl={0}
        rightSection={
          subtotal && (
            <Text c="dimmed" ff="monospace">
              {formatMoney(subtotal.amount, subtotal.currency)}
            </Text>
          )
        }
        onClick={onToggle}
      />
      {!collapsed &&
        accounts.map((a) => (
          <AccountItem
            key={a.id}
            account={a}
            active={a.id === selectedAccountId}
          />
        ))}
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
  const isCc = account.type === "credit_card";
  const isLoan = account.type === "loan";

  const nameRow = (
    <Group>
      {account.excludeFromNetWorth && (
        <Tooltip label="Excluded from net worth">
          <CircleOff
            aria-label="Excluded from net worth"
            color="var(--mantine-color-dimmed)"
            size={12}
          />
        </Tooltip>
      )}
      <Text>{account.name}</Text>
    </Group>
  );

  let label = nameRow;
  if (isCc) {
    label = (
      <Stack gap={0}>
        {nameRow}
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
        {nameRow}
        <LoanRemainingHint
          accountId={account.id}
          accountName={account.name}
          amountPerPeriod={BigInt(account.loan!.amountPerPeriod)}
          balance={available}
          currency={account.currency}
          frequency={account.loan!.frequency}
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

function LoanRemainingHint({
  accountId,
  accountName,
  balance,
  amountPerPeriod,
  currency,
  frequency,
}: {
  accountId: string;
  accountName: string;
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
      <Group>
        <Text c="dimmed" ff="monospace" size="xs">
          Paid off
        </Text>
        <ArchiveLoanButton accountId={accountId} accountName={accountName} />
      </Group>
    );
  }

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

function ArchiveLoanButton({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: () => archiveAccount(accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
    onError: (e) => alert((e as Error).message),
  });

  return (
    <Tooltip label="Archive">
      <ActionIcon
        aria-label={`Archive ${accountName}`}
        loading={archive.isPending}
        onClick={(e) => {
          e.preventDefault();
          // The label sits inside a NavLink (which is a Link); without
          // this, clicking the button also navigates to /transactions.
          e.stopPropagation();
          if (
            confirm(
              `Archive "${accountName}"? You can unarchive it later from the manage page.`,
            )
          ) {
            archive.mutate();
          }
        }}
      >
        <Archive size={12} />
      </ActionIcon>
    </Tooltip>
  );
}

const FREQUENCY_SUFFIX: Record<RecurringFrequency, string> = {
  weekly: "/wk",
  biweekly: "/2wk",
  monthly: "/mo",
  quarterly: "/qtr",
  yearly: "/yr",
};

// Net-worth summary for the sidebar header. Multi-currency users see one line
// per currency (no FX conversion done here).
function totalsByCurrency(items: Account[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const a of items) {
    totals.set(
      a.currency,
      (totals.get(a.currency) ?? 0n) + BigInt(a.presentBalance),
    );
  }
  return totals;
}

function groupSubtotal(
  items: Account[],
): { amount: bigint; currency: string } | null {
  const currency = items[0].currency;
  if (items.some((i) => i.currency !== currency)) return null;
  const total = items.reduce((sum, i) => sum + BigInt(i.presentBalance), 0n);
  return { amount: total, currency };
}

const COLLAPSED_KEY = "fin:sidebar.collapsedGroups";

function loadCollapsed(): Set<string> {
  // Tolerate any localStorage failure (private mode, quota, JSON shape
  // drift) by falling back to an empty set — collapsed state is a UX
  // nicety, not load-bearing.
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function saveCollapsed(set: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
  } catch {
    // ignore — see loadCollapsed
  }
}
