import Link from "next/link";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { LocalTodayInput } from "@/components/local-today-input";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  accounts,
  categories,
  subcategories,
  tags,
  transactionLegs,
  transactionLines,
  transactions,
} from "@/db/schema";
import { groupBy } from "@/lib/collections";
import { formatDayHeader } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { CurrentSession } from "@/lib/session";
import { markTransactionProcessed } from "./transactions/actions";

type Leg = {
  accountId: string;
  accountName: string;
  accountCurrency: string;
  amount: bigint;
};

type Line = {
  amount: bigint;
  currency: string;
  categoryName: string;
  subcategoryName: string | null;
  tagName: string | null;
};

type EnrichedTx = {
  id: string;
  date: string | null; // null = pending
  createdAt: Date;
  type: "income" | "expense" | "transfer" | "adjustment";
  description: string | null;
  legs: [Leg, ...Leg[]];
  lines: Line[];
};

const PAGE_LIMIT = 100;

// ─── Data fetching ────────────────────────────────────────────────────────

async function fetchTransactions(
  workspaceGroupId: string,
  accountId: string | undefined,
): Promise<{ pending: EnrichedTx[]; completed: EnrichedTx[] }> {
  const filteredTxIds = accountId
    ? db
        .select({ id: transactionLegs.transactionId })
        .from(transactionLegs)
        .where(eq(transactionLegs.accountId, accountId))
    : undefined;

  const baseWhere = and(
    eq(transactions.groupId, workspaceGroupId),
    filteredTxIds ? inArray(transactions.id, filteredTxIds) : undefined,
  );

  const [pendingRows, completedRows] = await Promise.all([
    // Pending: all, oldest-created first (so the one scheduled earliest sits
    // at the top of the pending stack).
    db
      .select()
      .from(transactions)
      .where(and(baseWhere, isNull(transactions.date)))
      .orderBy(asc(transactions.createdAt)),
    // Completed: paginated, newest date first.
    db
      .select()
      .from(transactions)
      .where(and(baseWhere, isNotNull(transactions.date)))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(PAGE_LIMIT),
  ]);

  const allRows = [...pendingRows, ...completedRows];
  if (allRows.length === 0) return { pending: [], completed: [] };
  const txIds = allRows.map((t) => t.id);

  const legRows = await db
    .select({
      transactionId: transactionLegs.transactionId,
      accountId: transactionLegs.accountId,
      accountName: accounts.name,
      accountCurrency: accounts.currency,
      amount: transactionLegs.amount,
    })
    .from(transactionLegs)
    .innerJoin(accounts, eq(accounts.id, transactionLegs.accountId))
    .where(inArray(transactionLegs.transactionId, txIds));

  const lineRows = await db
    .select({
      transactionId: transactionLines.transactionId,
      amount: transactionLines.amount,
      currency: transactionLines.currency,
      categoryName: categories.name,
      subcategoryName: subcategories.name,
      tagName: tags.name,
    })
    .from(transactionLines)
    .innerJoin(categories, eq(categories.id, transactionLines.categoryId))
    .leftJoin(
      subcategories,
      eq(subcategories.id, transactionLines.subcategoryId),
    )
    .leftJoin(tags, eq(tags.id, transactionLines.tagId))
    .where(inArray(transactionLines.transactionId, txIds));

  const legsByTx = groupBy(legRows, (l) => l.transactionId);
  const linesByTx = groupBy(lineRows, (l) => l.transactionId);

  const enrich = (t: (typeof allRows)[number]): EnrichedTx => {
    const [head, ...rest] = legsByTx.get(t.id) ?? [];
    if (!head) {
      throw new Error(`Invariant: transaction ${t.id} has no legs`);
    }
    return {
      id: t.id,
      date: t.date,
      createdAt: t.createdAt,
      type: t.type,
      description: t.description,
      legs: [head, ...rest],
      lines: linesByTx.get(t.id) ?? [],
    };
  };

  return {
    pending: pendingRows.map(enrich),
    completed: completedRows.map(enrich),
  };
}

// ─── Display derivation ───────────────────────────────────────────────────

function displayShape(tx: EnrichedTx, filterAccountId: string | undefined) {
  if (filterAccountId) {
    const leg = tx.legs.find((l) => l.accountId === filterAccountId);
    if (leg) {
      return {
        amount: leg.amount,
        currency: leg.accountCurrency,
        accountLabel: leg.accountName,
      };
    }
  }

  switch (tx.type) {
    case "expense": {
      const total = tx.lines.reduce((s, l) => s + l.amount, 0n);
      return {
        amount: -total,
        currency: tx.lines[0]?.currency ?? tx.legs[0].accountCurrency,
        accountLabel: tx.legs[0].accountName,
      };
    }
    case "income": {
      const total = tx.lines.reduce((s, l) => s + l.amount, 0n);
      return {
        amount: total,
        currency: tx.lines[0]?.currency ?? tx.legs[0].accountCurrency,
        accountLabel: tx.legs[0].accountName,
      };
    }
    case "transfer": {
      const outLeg = tx.legs.find((l) => l.amount < 0n);
      const inLeg = tx.legs.find((l) => l.amount > 0n);
      if (!outLeg || !inLeg) {
        throw new Error(`Invariant: transfer ${tx.id} missing in/out leg`);
      }
      if (outLeg.accountId === inLeg.accountId) {
        throw new Error(
          `Invariant: transfer ${tx.id} has same source and destination`,
        );
      }
      return {
        amount: inLeg.amount,
        currency: inLeg.accountCurrency,
        accountLabel: `${outLeg.accountName} → ${inLeg.accountName}`,
      };
    }
    case "adjustment": {
      const leg = tx.legs[0];
      return {
        amount: leg.amount,
        currency: leg.accountCurrency,
        accountLabel: leg.accountName,
      };
    }
  }
}

function primaryLabel(tx: EnrichedTx): string {
  if (tx.description) return tx.description;
  if (tx.lines[0]) return categoryLabel(tx.lines[0]);
  if (tx.type === "transfer") return "Transfer";
  if (tx.type === "adjustment") return "Balance adjustment";
  return "";
}

function categoryLabel(line: Line): string {
  return line.subcategoryName
    ? `${line.categoryName} / ${line.subcategoryName}`
    : line.categoryName;
}

function amountColorClass(tx: EnrichedTx, amount: bigint): string {
  if (tx.type === "transfer") return "text-foreground";
  if (amount > 0n) return "text-emerald-600 dark:text-emerald-400";
  if (amount < 0n) return "text-rose-600 dark:text-rose-400";
  return "text-foreground";
}

// ─── Components ───────────────────────────────────────────────────────────

export async function TransactionsList({
  session,
  accountId,
  accountName,
}: {
  session: CurrentSession;
  accountId: string | undefined;
  accountName: string | undefined;
}) {
  const { pending, completed } = await fetchTransactions(
    session.groupId,
    accountId,
  );

  if (pending.length === 0 && completed.length === 0) {
    return <EmptyState accountName={accountName} />;
  }

  // Completed transactions are already ordered by date desc; groupBy
  // preserves order.
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
            <Link href="/transactions/new">Create transaction</Link>
          </Button>
          {accountName && (
            <Button asChild variant="link" size="sm">
              <Link href="/">View all accounts</Link>
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
  txs: EnrichedTx[];
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
  txs: EnrichedTx[];
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

function rowContent(
  tx: EnrichedTx,
  filterAccountId: string | undefined,
): {
  primary: string;
  metaParts: string[];
  amount: bigint;
  currency: string;
} {
  const { amount, currency, accountLabel } = displayShape(tx, filterAccountId);
  const primary = primaryLabel(tx);

  const descriptionIsPrimary = tx.description !== null && tx.description !== "";
  const metaParts: string[] = [];
  if (descriptionIsPrimary && tx.lines[0]) {
    metaParts.push(categoryLabel(tx.lines[0]));
  }
  metaParts.push(accountLabel);

  return { primary, metaParts, amount, currency };
}

function TransactionRow({
  tx,
  filterAccountId,
}: {
  tx: EnrichedTx;
  filterAccountId: string | undefined;
}) {
  const { primary, metaParts, amount, currency } = rowContent(
    tx,
    filterAccountId,
  );
  return (
    <li className="border-border border-b last:border-0">
      <Link
        href={`/transactions/${tx.id}/edit`}
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
  tx: EnrichedTx;
  filterAccountId: string | undefined;
}) {
  const { primary, metaParts, amount, currency } = rowContent(
    tx,
    filterAccountId,
  );
  const boundMarkProcessed = markTransactionProcessed.bind(null, tx.id);

  return (
    <li className="border-border hover:bg-muted/40 flex items-start gap-4 border-b px-6 py-3 last:border-0">
      <Link
        href={`/transactions/${tx.id}/edit`}
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
      <form action={boundMarkProcessed}>
        <LocalTodayInput name="date" />
        <Button type="submit" size="sm" variant="outline">
          Mark processed
        </Button>
      </form>
    </li>
  );
}
