import type { EnrichedTransaction, TxLine } from "@fin/schemas";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { groupBy } from "@/lib/collections";
import { formatDayHeader, localDateKey } from "@/lib/dates";
import {
  listTransactions,
  processTransaction,
  reorderTransactions,
} from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";

export function TransactionsList({
  accountId,
  accountName,
}: {
  accountId: string | undefined;
  accountName: string | undefined;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["transactions", { accountId }],
    queryFn: () => listTransactions(accountId),
  });

  const serverByDay = useMemo(() => {
    const completed = q.data?.completed ?? [];
    return groupBy(completed, (t) => t.date ?? "");
  }, [q.data]);

  const [localByDay, setLocalByDay] =
    useState<Map<string, EnrichedTransaction[]>>(serverByDay);
  const [lastServerByDay, setLastServerByDay] = useState(serverByDay);
  if (lastServerByDay !== serverByDay) {
    setLastServerByDay(serverByDay);
    setLocalByDay(serverByDay);
  }

  const mutation = useMutation({
    mutationFn: reorderTransactions,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
    onError: () => {
      setLocalByDay(serverByDay);
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const sourceDate = findDateOfId(localByDay, activeId);
    const overDate = findDateOfId(localByDay, overId);
    if (!sourceDate || !overDate || sourceDate === overDate) return;

    setLocalByDay((prev) => {
      const source = prev.get(sourceDate) ?? [];
      const target = prev.get(overDate) ?? [];
      const moving = source.find((t) => t.id === activeId);
      if (!moving) return prev;
      const newSource = source.filter((t) => t.id !== activeId);
      const overIndex = target.findIndex((t) => t.id === overId);
      const newTarget = [
        ...target.slice(0, overIndex),
        { ...moving, date: overDate },
        ...target.slice(overIndex),
      ];
      const next = new Map(prev);
      if (newSource.length === 0) next.delete(sourceDate);
      else next.set(sourceDate, newSource);
      next.set(overDate, newTarget);
      return next;
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    const activeDate = findDateOfId(localByDay, activeId);
    const overDate = findDateOfId(localByDay, overId);
    if (!activeDate || !overDate) return;

    let finalMap = localByDay;
    if (activeDate === overDate && activeId !== overId) {
      const day = localByDay.get(activeDate) ?? [];
      const oldIndex = day.findIndex((t) => t.id === activeId);
      const newIndex = day.findIndex((t) => t.id === overId);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        finalMap = new Map(localByDay);
        finalMap.set(activeDate, arrayMove(day, oldIndex, newIndex));
      }
    }

    const withBalances = new Map(finalMap);
    for (const [date, txs] of finalMap) {
      withBalances.set(date, recomputeBalanceAfter(txs, accountId));
    }
    setLocalByDay(withBalances);

    const targetIds = (withBalances.get(overDate) ?? []).map((t) => t.id);
    mutation.mutate({ date: overDate, movingId: activeId, ids: targetIds });
  }

  if (q.isLoading) {
    return (
      <Text size="sm" c="dimmed" ta="center" p="xl">
        Loading…
      </Text>
    );
  }
  if (q.error) {
    return (
      <Text size="sm" c="red" ta="center" p="xl">
        {(q.error as Error).message}
      </Text>
    );
  }
  const pending = q.data?.pending ?? [];

  if (pending.length === 0 && localByDay.size === 0) {
    return <EmptyState accountName={accountName} />;
  }

  return (
    <Box>
      {pending.length > 0 && (
        <Section title="Pending">
          {pending.map((t) => (
            <PendingRow key={t.id} tx={t} filterAccountId={accountId} />
          ))}
        </Section>
      )}
      <DndContext
        sensors={sensors}
        modifiers={[restrictToVerticalAxis]}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {Array.from(localByDay.entries()).map(([date, dayTxs]) => (
          <Section key={date} title={formatDayHeader(date)}>
            <SortableContext
              items={dayTxs.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {dayTxs.map((t) => (
                <SortableRow key={t.id} tx={t} filterAccountId={accountId} />
              ))}
            </SortableContext>
          </Section>
        ))}
      </DndContext>
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Text
        size="xs"
        c="dimmed"
        tt="uppercase"
        fw={600}
        px="md"
        py="xs"
        bg="var(--mantine-color-body)"
        pos="sticky"
        top={0}
        style={{ zIndex: 10 }}
      >
        {title}
      </Text>
      <Divider />
      {children}
    </Box>
  );
}

function findDateOfId(
  byDay: Map<string, EnrichedTransaction[]>,
  id: string,
): string | undefined {
  for (const [date, txs] of byDay) {
    if (txs.some((t) => t.id === id)) return date;
  }
  return undefined;
}

function recomputeBalanceAfter(
  txs: EnrichedTransaction[],
  filterAccountId: string | undefined,
): EnrichedTransaction[] {
  if (!filterAccountId || txs.length === 0) return txs;
  const first = txs[0];
  if (first.balanceAfter === undefined) return txs;
  const result: EnrichedTransaction[] = [first];
  let running = BigInt(first.balanceAfter);
  for (let i = 1; i < txs.length; i++) {
    const prev = txs[i - 1];
    const prevLeg = prev.legs.find((l) => l.accountId === filterAccountId);
    if (prevLeg) running -= BigInt(prevLeg.amount);
    result.push({ ...txs[i], balanceAfter: running.toString() });
  }
  return result;
}

function EmptyState({ accountName }: { accountName: string | undefined }) {
  return (
    <Stack align="center" justify="center" py="xl" gap="md">
      <Text size="sm" c="dimmed">
        {accountName
          ? `No transactions for ${accountName} yet.`
          : "No transactions yet."}
      </Text>
      <Group>
        <Button component={Link} to="/transactions/new" size="sm">
          Create transaction
        </Button>
        {accountName && (
          <Button component={Link} to="/" variant="subtle" size="sm">
            View all accounts
          </Button>
        )}
      </Group>
    </Stack>
  );
}

function SortableRow({
  tx,
  filterAccountId,
}: {
  tx: EnrichedTransaction;
  filterAccountId: string | undefined;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tx.id });
  const [expanded, setExpanded] = useState(false);
  const isMultiLine = tx.lines.length > 1;
  const { primary, metaParts, amount, currency } = rowContent(
    tx,
    filterAccountId,
  );
  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <Group gap="xs" align="flex-start" px="sm" py="sm" wrap="nowrap">
        <UnstyledButton
          aria-label="Drag to reorder"
          mt={4}
          c="dimmed"
          style={{ cursor: "grab", touchAction: "none" }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </UnstyledButton>
        {isMultiLine ? (
          <UnstyledButton
            aria-label={expanded ? "Collapse lines" : "Expand lines"}
            onClick={() => setExpanded((v) => !v)}
            mt={4}
            c="dimmed"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </UnstyledButton>
        ) : (
          <Box w={16} h={16} mt={4} />
        )}
        <Anchor
          component={Link}
          to={`/transactions/${tx.id}/edit`}
          underline="never"
          c="inherit"
          flex={1}
          miw={0}
        >
          <Group
            justify="space-between"
            gap="md"
            align="flex-start"
            wrap="nowrap"
          >
            <Box flex={1} miw={0}>
              <Text size="sm" fw={500} truncate>
                {primary}
              </Text>
              <Text size="xs" c="dimmed" truncate mt={2}>
                {metaParts.join(" · ")}
              </Text>
            </Box>
            <Stack gap={0} align="flex-end">
              <Text
                size="sm"
                fw={500}
                ff="monospace"
                c={amountColor(tx, amount)}
              >
                {formatMoney(amount, currency)}
              </Text>
              {tx.balanceAfter !== undefined && (
                <Text size="xs" c="dimmed" ff="monospace">
                  {formatMoney(BigInt(tx.balanceAfter), currency)}
                </Text>
              )}
            </Stack>
          </Group>
        </Anchor>
      </Group>
      {isMultiLine && expanded && (
        <Stack gap={4} ml={36} pr="sm" pl="md" pb="xs">
          {tx.lines.map((line, i) => (
            <Group key={i} justify="space-between" gap="md" wrap="nowrap">
              <Text size="xs" c="dimmed" truncate>
                {categoryLabel(line)}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                {formatMoney(BigInt(line.amount), line.currency)}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
      <Divider />
    </Box>
  );
}

function displayShape(
  tx: EnrichedTransaction,
  filterAccountId: string | undefined,
) {
  if (filterAccountId) {
    const leg = tx.legs.find((l) => l.accountId === filterAccountId);
    if (leg) {
      return {
        amount: BigInt(leg.amount),
        currency: leg.accountCurrency,
        accountLabel: leg.accountName,
      };
    }
  }
  switch (tx.type) {
    case "expense":
    case "income": {
      const total = tx.lines.reduce((s, l) => s + BigInt(l.amount), 0n);
      return {
        amount: tx.type === "expense" ? -total : total,
        currency: tx.lines[0]?.currency ?? tx.legs[0]?.accountCurrency ?? "USD",
        accountLabel: tx.legs[0]?.accountName ?? "",
      };
    }
    case "transfer": {
      const outLeg = tx.legs.find((l) => BigInt(l.amount) < 0n);
      const inLeg = tx.legs.find((l) => BigInt(l.amount) > 0n);
      if (!outLeg || !inLeg) {
        throw new Error(`Invariant: transfer ${tx.id} missing in/out leg`);
      }
      return {
        amount: BigInt(inLeg.amount),
        currency: inLeg.accountCurrency,
        accountLabel: `${outLeg.accountName} → ${inLeg.accountName}`,
      };
    }
    case "adjustment": {
      const leg = tx.legs[0];
      return {
        amount: BigInt(leg?.amount ?? "0"),
        currency: leg?.accountCurrency ?? "USD",
        accountLabel: leg?.accountName ?? "",
      };
    }
  }
}

function primaryLabel(tx: EnrichedTransaction): string {
  if (tx.description) return tx.description;
  if (tx.lines.length > 1) return `${tx.lines.length} categories`;
  if (tx.lines[0]) return categoryLabel(tx.lines[0]);
  if (tx.type === "transfer") return "Transfer";
  if (tx.type === "adjustment") return "Balance adjustment";
  return "";
}

function categoryLabel(line: TxLine): string {
  return line.subcategoryName
    ? `${line.categoryName} / ${line.subcategoryName}`
    : line.categoryName;
}

function amountColor(tx: EnrichedTransaction, amount: bigint): string {
  if (tx.type === "transfer") return "inherit";
  if (amount > 0n) return "teal.7";
  if (amount < 0n) return "red.7";
  return "inherit";
}

function rowContent(
  tx: EnrichedTransaction,
  filterAccountId: string | undefined,
) {
  const { amount, currency, accountLabel } = displayShape(tx, filterAccountId);
  const primary = primaryLabel(tx);
  const descriptionIsPrimary = tx.description !== null && tx.description !== "";
  const metaParts: string[] = [];
  if (descriptionIsPrimary && tx.lines.length === 1) {
    metaParts.push(categoryLabel(tx.lines[0]));
  }
  if (accountLabel) metaParts.push(accountLabel);
  return { primary, metaParts, amount, currency };
}

function PendingRow({
  tx,
  filterAccountId,
}: {
  tx: EnrichedTransaction;
  filterAccountId: string | undefined;
}) {
  const qc = useQueryClient();
  const { primary, metaParts, amount, currency } = rowContent(
    tx,
    filterAccountId,
  );
  const mark = useMutation({
    mutationFn: (date: string) => processTransaction(tx.id, { date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
  return (
    <>
      <Group px="md" py="sm" gap="md" wrap="nowrap">
        <Anchor
          component={Link}
          to={`/transactions/${tx.id}/edit`}
          underline="never"
          c="inherit"
          flex={1}
          miw={0}
        >
          <Group justify="space-between" gap="md" wrap="nowrap">
            <Box flex={1} miw={0}>
              <Text size="sm" fw={500} truncate>
                {primary}
              </Text>
              <Text size="xs" c="dimmed" truncate mt={2}>
                {metaParts.join(" · ")}
              </Text>
            </Box>
            <Text size="sm" fw={500} ff="monospace" c={amountColor(tx, amount)}>
              {formatMoney(amount, currency)}
            </Text>
          </Group>
        </Anchor>
        <Button
          size="compact-sm"
          variant="default"
          loading={mark.isPending}
          onClick={() => mark.mutate(localDateKey(new Date()))}
        >
          Mark processed
        </Button>
      </Group>
      <Divider />
    </>
  );
}
