import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
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
  legs: Leg[];
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

  const legsByTx = new Map<string, Leg[]>();
  for (const l of legRows) {
    const list = legsByTx.get(l.transactionId) ?? [];
    list.push({
      accountId: l.accountId,
      accountName: l.accountName,
      accountCurrency: l.accountCurrency,
      amount: l.amount,
    });
    legsByTx.set(l.transactionId, list);
  }

  const linesByTx = new Map<string, Line[]>();
  for (const l of lineRows) {
    const list = linesByTx.get(l.transactionId) ?? [];
    list.push({
      amount: l.amount,
      currency: l.currency,
      categoryName: l.categoryName,
      subcategoryName: l.subcategoryName,
      tagName: l.tagName,
    });
    linesByTx.set(l.transactionId, list);
  }

  return txRows.map((t) => ({
    id: t.id,
    timestamp: t.timestamp,
    type: t.type,
    description: t.description,
    legs: legsByTx.get(t.id) ?? [],
    lines: linesByTx.get(t.id) ?? [],
  }));
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
        currency: tx.lines[0]?.currency ?? tx.legs[0]?.accountCurrency ?? "USD",
        accountLabel: tx.legs[0]?.accountName ?? "",
      };
    }
    case "income": {
      const total = tx.lines.reduce((s, l) => s + l.amount, 0n);
      return {
        amount: total,
        currency: tx.lines[0]?.currency ?? tx.legs[0]?.accountCurrency ?? "USD",
        accountLabel: tx.legs[0]?.accountName ?? "",
      };
    }
    case "transfer": {
      const outLeg = tx.legs.find((l) => l.amount < 0n);
      const inLeg = tx.legs.find((l) => l.amount > 0n);
      const primary = inLeg ?? outLeg;
      return {
        amount: primary?.amount ?? 0n,
        currency: primary?.accountCurrency ?? "USD",
        accountLabel:
          outLeg && inLeg
            ? `${outLeg.accountName} → ${inLeg.accountName}`
            : (primary?.accountName ?? ""),
      };
    }
    case "adjustment": {
      const leg = tx.legs[0];
      return {
        amount: leg?.amount ?? 0n,
        currency: leg?.accountCurrency ?? "USD",
        accountLabel: leg?.accountName ?? "",
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
  if (tx.type === "transfer") return "text-zinc-700 dark:text-zinc-300";
  if (amount > 0n) return "text-emerald-600 dark:text-emerald-400";
  if (amount < 0n) return "text-rose-600 dark:text-rose-400";
  return "text-zinc-700 dark:text-zinc-300";
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
  if (!session.groupId) return null;
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
        <p className="text-sm text-zinc-500">
          {accountName
            ? `No transactions for ${accountName} yet.`
            : "No transactions yet."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Link
            href="/transactions/new"
            className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Create transaction
          </Link>
          {accountName && (
            <Link
              href="/"
              className="text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              View all accounts
            </Link>
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
      <h2 className="sticky top-0 z-10 bg-zinc-50/90 px-6 py-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase backdrop-blur dark:bg-zinc-900/90">
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
  if (accountLabel) metaParts.push(accountLabel);
  if (timeStr) metaParts.push(timeStr);

  return (
    <li className="border-b border-zinc-100 px-6 py-3 last:border-0 hover:bg-zinc-50/60 dark:border-zinc-800/60 dark:hover:bg-zinc-800/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {primary}
          </div>
          {metaParts.length > 0 && (
            <div className="mt-0.5 truncate text-xs text-zinc-500">
              {metaParts.join(" · ")}
            </div>
          )}
        </div>
        <div
          className={`text-sm font-medium tabular-nums ${amountColorClass(
            tx,
            amount,
          )}`}
        >
          {formatMoney(amount, currency)}
        </div>
      </div>
    </li>
  );
}
