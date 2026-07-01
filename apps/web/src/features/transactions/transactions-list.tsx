import { SectionHeader } from "@/components/section-header";
import { groupBy } from "@/lib/collections";
import { formatDayHeader, localDateKey } from "@/lib/dates";
import {
  listTransactions,
  processTransaction,
  reorderTransactions,
} from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";

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
import type { EnrichedTransaction } from "@fin/schemas";
import {
  ActionIcon,
  Anchor,
  Box,
  Divider,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useIntersection } from "@mantine/hooks";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { categoryLabel, isDebtPayment, primaryLabel } from "./tx-display";

export function TransactionsList({
  accountId,
}: {
  accountId: string | undefined;
}) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["transactions", { accountId }],
    queryFn: ({ pageParam }) => listTransactions(accountId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  // Pages arrive newest→oldest and never split a day, so flattening keeps
  // global order. Pending rows ride along on the first page only.
  const completed = useMemo(
    () => q.data?.pages.flatMap((p) => p.completed) ?? [],
    [q.data],
  );
  const serverByDay = useMemo(
    () => groupBy(completed, (t) => t.date!), // completed have date
    [completed],
  );
  const [localByDay, setLocalByDay] =
    useState<Map<string, EnrichedTransaction[]>>(serverByDay);
  const [lastServerByDay, setLastServerByDay] = useState(serverByDay);
  if (lastServerByDay !== serverByDay) {
    setLastServerByDay(serverByDay);
    setLocalByDay(serverByDay);
  }
  const pending = q.data?.pages[0]?.pending ?? [];

  const mutation = useMutation({
    mutationFn: reorderTransactions,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
    onError: () => {
      setLocalByDay(serverByDay);
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  // Infinite scroll: fetch the next page when the bottom sentinel scrolls
  // into view. rootMargin pre-fetches a screenful early so it feels seamless.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  const { ref: sentinelRef, entry } = useIntersection({ rootMargin: "400px" });
  useEffect(() => {
    if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [entry?.isIntersecting, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // @dnd
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
      const sourceTxs = prev.get(sourceDate) ?? [];
      const targetTxs = prev.get(overDate) ?? [];
      const movingTx = sourceTxs.find((t) => t.id === activeId);
      if (!movingTx) return prev;
      const newSourceTxs = sourceTxs.filter((t) => t.id !== activeId);
      const overIndex = targetTxs.findIndex((t) => t.id === overId);
      const newTargetTxs = [
        ...targetTxs.slice(0, overIndex),
        { ...movingTx, date: overDate },
        ...targetTxs.slice(overIndex),
      ];
      const next = new Map(prev);
      if (newSourceTxs.length === 0) next.delete(sourceDate);
      else next.set(sourceDate, newSourceTxs);
      next.set(overDate, newTargetTxs);
      return next;
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    const currentDate = findDateOfId(localByDay, activeId);
    if (!currentDate) {
      throw new Error("Invariant: drag id must live in localByDay");
    }
    const dayTxs = localByDay.get(currentDate);
    if (!dayTxs) {
      throw new Error("Invariant: currentDate must be a key of localByDay");
    }

    // Apply the final same-day reorder. We do NOT early-return on
    // `activeId === overId` — that case is legal and common in the
    // cross-day path: `onDragOver` already moved the tx into the new
    // day, so the dragged tx is sitting under the cursor at release,
    // making `over === active`. Bailing out here would silently drop
    // the cross-day move on the floor (the bug fix).
    let finalDayTxs = dayTxs;
    if (activeId !== overId) {
      const oldIndex = dayTxs.findIndex((t) => t.id === activeId);
      const newIndex = dayTxs.findIndex((t) => t.id === overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        finalDayTxs = arrayMove(dayTxs, oldIndex, newIndex);
      }
    }

    // No-op detection: same day + identical order as server → nothing
    // to submit. Catches both "released without moving" and "dragged
    // away and back to original position."
    const originalDate = findDateOfId(serverByDay, activeId);
    const sameDay = currentDate === originalDate;
    const serverDayTxs = serverByDay.get(currentDate) ?? [];
    const sameOrder =
      finalDayTxs.length === serverDayTxs.length &&
      finalDayTxs.every((t, i) => t.id === serverDayTxs[i]?.id);
    if (sameDay && sameOrder) return;

    const reordered = new Map(localByDay);
    reordered.set(currentDate, finalDayTxs);
    const targetIds = finalDayTxs.map((t) => t.id);
    mutation.mutate({ date: currentDate, movingId: activeId, ids: targetIds });
    setLocalByDay(reordered);
  }

  if (q.isError)
    return <Text c="red">Failed to load: {(q.error as Error).message}</Text>;
  if (q.isLoading) return <Text c="dimmed">Loading...</Text>;

  return (
    <>
      {pending.length === 0 && localByDay.size === 0 && (
        <Text c="dimmed" ta="center">
          No transactions yet.
        </Text>
      )}
      {pending.length > 0 && (
        <Section title="Pending">
          {pending.map((t) => (
            <PendingRow key={t.id} filterAccountId={accountId} tx={t} />
          ))}
        </Section>
      )}
      <DndContext
        modifiers={[restrictToVerticalAxis]}
        sensors={sensors}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
      >
        {Array.from(localByDay.entries()).map(([date, dayTxs]) => (
          <Section key={date} title={formatDayHeader(date)}>
            <SortableContext
              items={dayTxs.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {dayTxs.map((t) => (
                <SortableRow key={t.id} filterAccountId={accountId} tx={t} />
              ))}
            </SortableContext>
          </Section>
        ))}
      </DndContext>
      {/* Bottom sentinel: entering the viewport triggers the next page. */}
      {hasNextPage && (
        <Box ref={sentinelRef} py="sm" ta="center">
          <Text c="dimmed" size="sm">
            {isFetchingNextPage ? "Loading more…" : ""}
          </Text>
        </Box>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <SectionHeader compact>{title}</SectionHeader>
      <Divider />
      <Stack pb="xs">{children}</Stack>
    </>
  );
}

function PendingRow({
  tx,
  filterAccountId,
}: {
  tx: EnrichedTransaction;
  filterAccountId: string | undefined;
}) {
  const qc = useQueryClient();
  const mark = useMutation({
    mutationFn: (date: string) => processTransaction(tx.id, { date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
  return (
    <>
      <Group>
        <ActionIcon onClick={() => mark.mutate(localDateKey(new Date()))}>
          <Check size={14} />
        </ActionIcon>
        <Anchor
          c="inherit"
          component={Link}
          flex={1}
          to={`/transactions/${tx.id}/edit`}
          underline="never"
        >
          <RowBody
            filterAccountId={filterAccountId}
            showRunningBalance={false}
            tx={tx}
          />
        </Anchor>
      </Group>
    </>
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
  // Loan payment = transfer + categorization lines for the fee/interest
  // portion. The expansion shows the principal row (Source → Destination)
  // alongside the line breakdown so principal + lines = total cash out.
  const isLoanPayment = tx.type === "transfer" && tx.lines.length > 0;
  const expandable = tx.lines.length > 1 || isLoanPayment;
  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <Group align="flex-start">
        {/* DnD / Expand */}
        <UnstyledButton
          c="dimmed"
          style={{ cursor: "grab", touchAction: "none" }}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical size={14} />
        </UnstyledButton>
        {expandable && (
          <UnstyledButton
            aria-label={expanded ? "Collapse lines" : "Expand lines"}
            c="dimmed"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </UnstyledButton>
        )}
        {/* TX row */}
        <Anchor
          c="inherit"
          component={Link}
          flex={1}
          to={`/transactions/${tx.id}/edit`}
          underline="never"
        >
          <RowBody
            filterAccountId={filterAccountId}
            showRunningBalance
            tx={tx}
          />
          {expandable && expanded && (
            <Stack>
              {isLoanPayment &&
                (() => {
                  const inLeg = tx.legs.find((l) => BigInt(l.amount) > 0n);
                  const outLeg = tx.legs.find((l) => BigInt(l.amount) < 0n);
                  if (!inLeg || !outLeg) {
                    throw new Error(
                      `Invariant: transfer ${tx.id} missing in/out leg`,
                    );
                  }
                  return (
                    <Group key="principal" justify="space-between" pr="xs">
                      <Text c="dimmed" size="xs">
                        {outLeg.accountName} → {inLeg.accountName}
                      </Text>
                      <Text c="dimmed" ff="monospace" size="xs">
                        {formatMoney(
                          BigInt(inLeg.amount),
                          inLeg.accountCurrency,
                        )}
                      </Text>
                    </Group>
                  );
                })()}
              {tx.lines.map((line, i) => (
                <Group key={i} justify="space-between" pr="xs">
                  <Text c="dimmed" size="xs">
                    {categoryLabel(line)}
                    {line.tags.length > 0 &&
                      ` ${line.tags.map((t) => `#${t.name}`).join(" ")}`}
                  </Text>
                  <Text c="dimmed" ff="monospace" size="xs">
                    {formatMoney(BigInt(line.amount), line.currency)}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Anchor>
      </Group>
    </Box>
  );
}

function RowBody({
  tx,
  filterAccountId,
  showRunningBalance,
}: {
  tx: EnrichedTransaction;
  filterAccountId: string | undefined;
  showRunningBalance: boolean;
}) {
  const { primary, metaParts, amount, currency } = rowContent(
    tx,
    filterAccountId,
  );
  return (
    <Group justify="space-between" pr="xs">
      <Stack gap={0}>
        <Text fw={500}>{primary}</Text>
        <Text c="dimmed" size="xs">
          {metaParts.join(" · ")}
        </Text>
      </Stack>
      <Stack align="flex-end" gap={0}>
        <Text c={amountColor(tx, amount)} ff="monospace" fw={500}>
          {formatMoney(amount, currency)}
        </Text>
        {showRunningBalance && tx.balanceAfter !== undefined && (
          <Text c="dimmed" ff="monospace" size="xs">
            {formatMoney(BigInt(tx.balanceAfter), currency)}
          </Text>
        )}
      </Stack>
    </Group>
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
      // Use |outLeg| (cash leaving the source) so loan payments display the
      // total cash motion ($99) rather than just the principal portion that
      // landed at the destination ($89). For pure transfers (no lines)
      // |outLeg| === inLeg, so this is a no-op in the common case.
      //
      // Payments to a debt account (CC / loan): the destination is the
      // "subject" (handled by primaryLabel as "{name} payment"), so meta
      // only needs to show the source. For pure transfers, show the full
      // source → destination flow.
      const isPayment = isDebtPayment(inLeg);
      return {
        amount: -BigInt(outLeg.amount),
        currency: outLeg.accountCurrency,
        accountLabel: isPayment
          ? outLeg.accountName
          : `${outLeg.accountName} → ${inLeg.accountName}`,
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
    case "refund": {
      // Refund is income-shaped on the wire: a single positive leg
      // on the receiving account, with positive lines mirroring the
      // original's categories. Display as the leg's positive amount.
      const total = tx.lines.reduce((s, l) => s + BigInt(l.amount), 0n);
      return {
        amount: total,
        currency: tx.lines[0]?.currency ?? tx.legs[0]?.accountCurrency ?? "USD",
        accountLabel: tx.legs[0]?.accountName ?? "",
      };
    }
  }
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
  // For transfers (incl. CC / loan payments), any line breakdown is shown
  // in the row's expansion — repeating it inline would duplicate.
  if (descriptionIsPrimary && tx.lines.length === 1 && tx.type !== "transfer") {
    metaParts.push(categoryLabel(tx.lines[0]));
  }
  if (accountLabel) metaParts.push(accountLabel);
  const recurringLabel = recurringSourceLabel(tx);
  if (recurringLabel) metaParts.push(recurringLabel);
  const refundLabel = refundSourceLabel(tx);
  if (refundLabel) metaParts.push(refundLabel);
  const tagLabel = tagsLabel(tx);
  if (tagLabel) metaParts.push(tagLabel);
  return { primary, metaParts, amount, currency };
}

/**
 * "↻ Netflix" when the tx is a bill charge. Loan / CC payments will plug
 * in here too — same `↻` glyph, name pulled from the corresponding entity.
 */
function recurringSourceLabel(tx: EnrichedTransaction): string {
  if (tx.billName) return `↻ ${tx.billName}`;
  return "";
}

/**
 * "↶ Refund of <original>" for refund transactions. Mirrors the bill
 * indicator — single glyph + source name — but uses ↶ to signal
 * "reversal" rather than the recurring/cyclical ↻.
 */
function refundSourceLabel(tx: EnrichedTransaction): string {
  if (!tx.refundedTransactionId) return "";
  return `↶ Refund of ${tx.refundedTransactionDescription ?? "transaction"}`;
}

/** Dedupes tags across lines and renders as `#tag1 #tag2`. */
function tagsLabel(tx: EnrichedTransaction): string {
  const seen = new Set<string>();
  for (const l of tx.lines) for (const t of l.tags) seen.add(t.name);
  if (seen.size === 0) return "";
  return [...seen].map((n) => `#${n}`).join(" ");
}
