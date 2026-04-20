import type { EnrichedTransaction, TxLine } from "@fin/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { groupBy } from "@/lib/collections";
import { formatDayHeader, localDateKey } from "@/lib/dates";
import { listTransactions, processTransaction } from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";

export function TransactionsList({
  accountId,
  accountName,
}: {
  accountId: string | undefined;
  accountName: string | undefined;
}) {
  const q = useQuery({
    queryKey: ["transactions", { accountId }],
    queryFn: () => listTransactions(accountId),
  });

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
  const { pending, completed } = q.data ?? { pending: [], completed: [] };

  if (pending.length === 0 && completed.length === 0) {
    return <EmptyState accountName={accountName} />;
  }

  const byDay = groupBy(completed, (t) => t.date ?? "");

  return (
    <div>
      {pending.length > 0 && (
        <PendingSection txs={pending} filterAccountId={accountId} />
      )}
      {Array.from(byDay.entries()).map(([date, dayTxs]) => (
        <DaySection
          key={date}
          date={date}
          txs={dayTxs}
          filterAccountId={accountId}
        />
      ))}
    </div>
  );
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
      <ul>
        {txs.map((t) => (
          <TransactionRow key={t.id} tx={t} filterAccountId={filterAccountId} />
        ))}
      </ul>
    </section>
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

function TransactionRow({
  tx,
  filterAccountId,
}: {
  tx: EnrichedTransaction;
  filterAccountId: string | undefined;
}) {
  const { primary, metaParts, amount, currency } = rowContent(
    tx,
    filterAccountId,
  );
  return (
    <li className="border-border border-b last:border-0">
      <Link
        to={`/transactions/${tx.id}/edit`}
        className="hover:bg-muted/40 flex items-start justify-between gap-4 px-6 py-3"
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
    </li>
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
