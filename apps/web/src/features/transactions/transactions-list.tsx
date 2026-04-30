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
import type { EnrichedTransaction, TxLeg, TxLine } from "@fin/schemas";
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Divider,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";

import { SectionHeader } from "@/components/section-header";
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
}: {
  accountId: string | undefined;
}) {
  // Data & states
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
    if (activeId === overId) return;

    const activeDate = findDateOfId(localByDay, activeId);
    const overDate = findDateOfId(localByDay, overId);
    if (!activeDate || !overDate) {
      throw new Error("Invariant: drag ids must live in localByDay");
    }
    if (activeDate !== overDate) {
      throw new Error(
        "Invariant: onDragOver should have unified activeDate and overDate",
      );
    }

    const dayTxs = localByDay.get(activeDate);
    if (!dayTxs) {
      throw new Error("Invariant: activeDate must be a key of localByDay");
    }
    const oldIndex = dayTxs.findIndex((t) => t.id === activeId);
    const newIndex = dayTxs.findIndex((t) => t.id === overId);
    if (oldIndex === newIndex) return;

    const movedDayTxs = arrayMove(dayTxs, oldIndex, newIndex);
    const reordered = new Map(localByDay);
    reordered.set(activeDate, movedDayTxs);

    const targetIds = movedDayTxs.map((t) => t.id);
    mutation.mutate({ date: overDate, movingId: activeId, ids: targetIds });
    setLocalByDay(reordered);
  }

  if (q.isLoading) return null; // TODO: Maybe spinner later.
  if (q.error) return <Alert color="red">{(q.error as Error).message}</Alert>;
  const pending = q.data?.pending ?? [];

  if (pending.length === 0 && localByDay.size === 0) {
    return (
      <Text c="dimmed" ta="center">
        No transactions yet.
      </Text>
    );
  }

  return (
    <>
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
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Box px="xs">
        <SectionHeader compact>{title}</SectionHeader>
      </Box>
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
    <Group pr="xs">
      <Box flex={1}>
        <Text fw={500}>{primary}</Text>
        <Text c="dimmed" size="xs">
          {metaParts.join(" · ")}
        </Text>
      </Box>
      <Stack align="flex-end">
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
  }
}

function primaryLabel(tx: EnrichedTransaction): string {
  if (tx.description) return tx.description;
  if (tx.type === "transfer") {
    // Payments to a debt account (CC / loan) read more naturally as
    // "{destination} payment" than as a generic transfer. The line
    // breakdown (e.g., interest) is shown in the row's expansion.
    const inLeg = tx.legs.find((l) => BigInt(l.amount) > 0n);
    if (inLeg && isDebtPayment(inLeg)) return `${inLeg.accountName} payment`;
    return "Transfer";
  }
  if (tx.lines.length > 1) return `${tx.lines.length} categories`;
  if (tx.lines[0]) return categoryLabel(tx.lines[0]);
  if (tx.type === "adjustment") return "Balance adjustment";
  return "";
}

// A transfer whose destination is a debt account is a settlement payment
// (paying down a CC or a loan), not a plain account-to-account transfer.
function isDebtPayment(inLeg: TxLeg): boolean {
  return inLeg.accountType === "credit_card" || inLeg.accountType === "loan";
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
  // For transfers (incl. CC / loan payments), any line breakdown is shown
  // in the row's expansion — repeating it inline would duplicate.
  if (descriptionIsPrimary && tx.lines.length === 1 && tx.type !== "transfer") {
    metaParts.push(categoryLabel(tx.lines[0]));
  }
  if (accountLabel) metaParts.push(accountLabel);
  const recurringLabel = recurringSourceLabel(tx);
  if (recurringLabel) metaParts.push(recurringLabel);
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

/** Dedupes tags across lines and renders as `#tag1 #tag2`. */
function tagsLabel(tx: EnrichedTransaction): string {
  const seen = new Set<string>();
  for (const l of tx.lines) for (const t of l.tags) seen.add(t.name);
  if (seen.size === 0) return "";
  return [...seen].map((n) => `#${n}`).join(" ");
}
