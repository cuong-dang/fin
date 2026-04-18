import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
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
import { dayKey, formatDayHeader } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { CurrentSession } from "@/lib/session";

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
  timestamp: Date;
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
): Promise<EnrichedTx[]> {
  const filteredTxIds = accountId
    ? db
        .select({ id: transactionLegs.transactionId })
        .from(transactionLegs)
        .where(eq(transactionLegs.accountId, accountId))
    : undefined;

  const txRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.groupId, workspaceGroupId),
        filteredTxIds ? inArray(transactions.id, filteredTxIds) : undefined,
      ),
    )
    .orderBy(desc(transactions.timestamp))
    .limit(PAGE_LIMIT);

  if (txRows.length === 0) return [];
  const txIds = txRows.map((t) => t.id);

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

  return txRows.map((t) => {
    const [head, ...rest] = legsByTx.get(t.id) ?? [];
    if (!head) {
      throw new Error(`Invariant: transaction ${t.id} has no legs`);
    }
    return {
      id: t.id,
      timestamp: t.timestamp,
      type: t.type,
      description: t.description,
      legs: [head, ...rest],
      lines: linesByTx.get(t.id) ?? [],
    };
  });
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

/** Back-dated entries default to exactly midnight; hide that instead of
 * showing "12:00 AM" everywhere. Today-entered transactions keep real time. */
function maybeFormatTime(date: Date): string | null {
  if (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0
  ) {
    return null;
  }
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
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
  const txs = await fetchTransactions(session.groupId, accountId);

  if (txs.length === 0) {
    return <EmptyState accountName={accountName} />;
  }

  const days = new Map<string, { date: Date; txs: EnrichedTx[] }>();
  for (const t of txs) {
    const key = dayKey(t.timestamp);
    const bucket = days.get(key);
    if (bucket) {
      bucket.txs.push(t);
    } else {
      days.set(key, { date: t.timestamp, txs: [t] });
    }
  }
  const ordered = Array.from(days.values());

  return (
    <div>
      {ordered.map((d) => (
        <DaySection
          key={dayKey(d.date)}
          date={d.date}
          txs={d.txs}
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

function DaySection({
  date,
  txs,
  filterAccountId,
}: {
  date: Date;
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

function TransactionRow({
  tx,
  filterAccountId,
}: {
  tx: EnrichedTx;
  filterAccountId: string | undefined;
}) {
  const { amount, currency, accountLabel } = displayShape(tx, filterAccountId);
  const primary = primaryLabel(tx);
  const timeStr = maybeFormatTime(tx.timestamp);

  // Meta line pieces. If the description IS the primary label, we don't
  // repeat the category there — but we still include account + time.
  // If there's no description (primary is the category), skip category to
  // avoid duplication; just show account + time.
  const descriptionIsPrimary = tx.description !== null && tx.description !== "";
  const metaParts: string[] = [];
  if (descriptionIsPrimary && tx.lines[0]) {
    metaParts.push(categoryLabel(tx.lines[0]));
  }
  metaParts.push(accountLabel);
  if (timeStr) metaParts.push(timeStr);

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
