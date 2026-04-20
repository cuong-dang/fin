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
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
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

  // Server-side byDay derived from the current query result. Stable across
  // renders as long as `completed` doesn't change.
  const serverByDay = useMemo(() => {
    const completed = q.data?.completed ?? [];
    return groupBy(completed, (t) => t.date ?? "");
  }, [q.data]);

  // Local override for optimistic reorders/moves. Resets to serverByDay
  // whenever the server refetches — uses React's "store previous value"
  // pattern so we sync during render without an effect.
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

  // Cross-day drag: move the dragged item into the hovered day as the user
  // drags, so that day's SortableContext can animate the other rows making
  // space. Within-day motion is handled by the SortableContext itself — no
  // state change here, only at drop.
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

    // After onDragOver moved the item, activeId may already be in over's day.
    const activeDate = findDateOfId(localByDay, activeId);
    const overDate = findDateOfId(localByDay, overId);
    if (!activeDate || !overDate) return;

    let finalMap = localByDay;
    if (activeDate === overDate && activeId !== overId) {
      // Final position within the (possibly just-landed-in) day.
      const day = localByDay.get(activeDate) ?? [];
      const oldIndex = day.findIndex((t) => t.id === activeId);
      const newIndex = day.findIndex((t) => t.id === overId);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        const reordered = arrayMove(day, oldIndex, newIndex);
        finalMap = new Map(localByDay);
        finalMap.set(activeDate, reordered);
      }
    }

    // Recompute running balance on every affected day.
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
      <div className="p-12 text-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="p-12 text-center">
        <p className="text-destructive text-sm">{(q.error as Error).message}</p>
      </div>
    );
  }
  const pending = q.data?.pending ?? [];

  if (pending.length === 0 && localByDay.size === 0) {
    return <EmptyState accountName={accountName} />;
  }

  return (
    <div>
      {pending.length > 0 && (
        <PendingSection txs={pending} filterAccountId={accountId} />
      )}
      <DndContext
        sensors={sensors}
        modifiers={[restrictToVerticalAxis]}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {Array.from(localByDay.entries()).map(([date, dayTxs]) => (
          <DaySection
            key={date}
            date={date}
            txs={dayTxs}
            filterAccountId={accountId}
          />
        ))}
      </DndContext>
    </div>
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

/**
 * After a reorder (or cross-day move) within an account-filtered view,
 * recompute the running balance locally so the UI updates instantly. Newest
 * row keeps its server-provided balanceAfter; each older row derives from the
 * next-newer: balanceAfter[i+1] = balanceAfter[i] - leg_for_this_account[i].
 *
 * No-op when no account filter is active or the rows have no balanceAfter.
 */
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
    <div className="flex h-full items-center justify-center p-12 text-center">
      <div className="max-w-sm">
        <p className="text-muted-foreground text-sm">
          {accountName
            ? `No transactions for ${accountName} yet.`
            : "No transactions yet."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button asChild size="sm">
            <Link to="/transactions/new">Create transaction</Link>
          </Button>
          {accountName && (
            <Button asChild variant="link" size="sm">
              <Link to="/">View all accounts</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PendingSection({
  txs,
  filterAccountId,
}: {
  txs: EnrichedTransaction[];
  filterAccountId: string | undefined;
}) {
  return (
    <section>
      <h2 className="bg-background/90 text-muted-foreground sticky top-0 z-10 px-6 py-2 text-[11px] font-semibold tracking-wider uppercase backdrop-blur">
        Pending
      </h2>
      <ul>
        {txs.map((t) => (
          <PendingRow key={t.id} tx={t} filterAccountId={filterAccountId} />
        ))}
      </ul>
    </section>
  );
}

function DaySection({
  date,
  txs,
  filterAccountId,
}: {
  date: string;
  txs: EnrichedTransaction[];
  filterAccountId: string | undefined;
}) {
  return (
    <section>
      <h2 className="bg-background/90 text-muted-foreground sticky top-0 z-10 px-6 py-2 text-[11px] font-semibold tracking-wider uppercase backdrop-blur">
        {formatDayHeader(date)}
      </h2>
      <SortableContext
        items={txs.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul>
          {txs.map((t) => (
            <SortableRow key={t.id} tx={t} filterAccountId={filterAccountId} />
          ))}
        </ul>
      </SortableContext>
    </section>
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
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const { primary, metaParts, amount, currency } = rowContent(
    tx,
    filterAccountId,
  );
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="border-border hover:bg-muted/40 flex items-start gap-2 border-b px-3 py-3 last:border-0"
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="text-muted-foreground hover:text-foreground mt-1 cursor-grab touch-none active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Link
        to={`/transactions/${tx.id}/edit`}
        className="flex min-w-0 flex-1 items-start justify-between gap-4"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{primary}</div>
          <div className="text-muted-foreground mt-0.5 truncate text-xs">
            {metaParts.join(" · ")}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div
            className={`text-sm font-medium tabular-nums ${amountColorClass(
              tx,
              amount,
            )}`}
          >
            {formatMoney(amount, currency)}
          </div>
          {tx.balanceAfter !== undefined && (
            <div className="text-muted-foreground text-xs tabular-nums">
              {formatMoney(BigInt(tx.balanceAfter), currency)}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}

// ─── Display derivation ───────────────────────────────────────────────────

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
    case "expense": {
      const total = tx.lines.reduce((s, l) => s + BigInt(l.amount), 0n);
      return {
        amount: -total,
        currency: tx.lines[0]?.currency ?? tx.legs[0]?.accountCurrency ?? "USD",
        accountLabel: tx.legs[0]?.accountName ?? "",
      };
    }
    case "income": {
      const total = tx.lines.reduce((s, l) => s + BigInt(l.amount), 0n);
      return {
        amount: total,
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

function amountColorClass(tx: EnrichedTransaction, amount: bigint): string {
  if (tx.type === "transfer") return "text-foreground";
  if (amount > 0n) return "text-emerald-600 dark:text-emerald-400";
  if (amount < 0n) return "text-rose-600 dark:text-rose-400";
  return "text-foreground";
}

function rowContent(
  tx: EnrichedTransaction,
  filterAccountId: string | undefined,
) {
  const { amount, currency, accountLabel } = displayShape(tx, filterAccountId);
  const primary = primaryLabel(tx);
  const descriptionIsPrimary = tx.description !== null && tx.description !== "";
  const metaParts: string[] = [];
  if (descriptionIsPrimary && tx.lines[0]) {
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
    <li className="border-border hover:bg-muted/40 flex items-start gap-4 border-b px-6 py-3 last:border-0">
      <Link
        to={`/transactions/${tx.id}/edit`}
        className="flex min-w-0 flex-1 items-start justify-between gap-4"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{primary}</div>
          <div className="text-muted-foreground mt-0.5 truncate text-xs">
            {metaParts.join(" · ")}
          </div>
        </div>
        <div
          className={`text-sm font-medium tabular-nums ${amountColorClass(
            tx,
            amount,
          )}`}
        >
          {formatMoney(amount, currency)}
        </div>
      </Link>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={mark.isPending}
        onClick={() => mark.mutate(localDateKey(new Date()))}
      >
        {mark.isPending ? "…" : "Mark processed"}
      </Button>
    </li>
  );
}
