import type { EnrichedTransaction } from "@fin/schemas";
import { eq, inArray } from "drizzle-orm";

import { db, schema } from "../db";
import { groupBy } from "./collections";

async function fetchLegs(txIds: string[]) {
  if (txIds.length === 0) return [];
  return db
    .select({
      transactionId: schema.transactionLegs.transactionId,
      accountId: schema.transactionLegs.accountId,
      accountName: schema.accounts.name,
      accountCurrency: schema.accounts.currency,
      amount: schema.transactionLegs.amount,
    })
    .from(schema.transactionLegs)
    .innerJoin(
      schema.accounts,
      eq(schema.accounts.id, schema.transactionLegs.accountId),
    )
    .where(inArray(schema.transactionLegs.transactionId, txIds));
}

async function fetchLines(txIds: string[]) {
  if (txIds.length === 0) return [];
  return db
    .select({
      id: schema.transactionLines.id,
      transactionId: schema.transactionLines.transactionId,
      amount: schema.transactionLines.amount,
      currency: schema.transactionLines.currency,
      categoryId: schema.transactionLines.categoryId,
      categoryName: schema.categories.name,
      subcategoryId: schema.transactionLines.subcategoryId,
      subcategoryName: schema.subcategories.name,
    })
    .from(schema.transactionLines)
    .innerJoin(
      schema.categories,
      eq(schema.categories.id, schema.transactionLines.categoryId),
    )
    .leftJoin(
      schema.subcategories,
      eq(schema.subcategories.id, schema.transactionLines.subcategoryId),
    )
    .where(inArray(schema.transactionLines.transactionId, txIds));
}

async function fetchLineTags(lineIds: string[]) {
  if (lineIds.length === 0) return [];
  return db
    .select({
      lineId: schema.transactionLineTags.lineId,
      tagId: schema.tags.id,
      tagName: schema.tags.name,
    })
    .from(schema.transactionLineTags)
    .innerJoin(
      schema.tags,
      eq(schema.tags.id, schema.transactionLineTags.tagId),
    )
    .where(inArray(schema.transactionLineTags.lineId, lineIds))
    .orderBy(schema.tags.name);
}

/**
 * Subscription names keyed by transaction id, for tx rows that link to a
 * sub. We don't filter `subscriptions.deleted_at` — past transactions
 * should still surface their (now-deleted) sub's name.
 */
async function fetchSubsForTxs(txIds: string[]) {
  if (txIds.length === 0) return [];
  return db
    .select({
      txId: schema.transactions.id,
      subId: schema.subscriptions.id,
      subName: schema.subscriptions.name,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.subscriptions,
      eq(schema.subscriptions.id, schema.transactions.subscriptionId),
    )
    .where(inArray(schema.transactions.id, txIds));
}

type LegRow = Awaited<ReturnType<typeof fetchLegs>>[number];
type LineRow = Awaited<ReturnType<typeof fetchLines>>[number];
type LineTagRow = Awaited<ReturnType<typeof fetchLineTags>>[number];
type SubRow = Awaited<ReturnType<typeof fetchSubsForTxs>>[number];

export async function fetchLegsAndLines(txIds: string[]) {
  const [legRows, lineRows, subRows] = await Promise.all([
    fetchLegs(txIds),
    fetchLines(txIds),
    fetchSubsForTxs(txIds),
  ]);
  const tagRows = await fetchLineTags(lineRows.map((l) => l.id));
  return {
    legsByTx: groupBy(legRows, (l) => l.transactionId),
    linesByTx: groupBy(lineRows, (l) => l.transactionId),
    tagsByLine: groupBy(tagRows, (t) => t.lineId),
    subByTx: new Map(subRows.map((s) => [s.txId, s])),
  };
}

export function enrichTx(
  tx: {
    id: string;
    date: string | null;
    createdAt: Date;
    type: "income" | "expense" | "transfer" | "adjustment";
    description: string | null;
    subscriptionId: string | null;
  },
  legs: LegRow[] | undefined,
  lines: LineRow[] | undefined,
  tagsByLine: Map<string, LineTagRow[]>,
  sub: SubRow | undefined,
  balanceAfter?: bigint,
): EnrichedTransaction {
  if (!legs) {
    throw new Error(`Invariant: transaction ${tx.id} has no legs`);
  }
  return {
    id: tx.id,
    date: tx.date,
    createdAt: tx.createdAt.toISOString(),
    type: tx.type,
    description: tx.description,
    subscriptionId: tx.subscriptionId,
    subscriptionName: sub?.subName ?? null,
    legs: legs.map((l) => ({
      accountId: l.accountId,
      accountName: l.accountName,
      accountCurrency: l.accountCurrency,
      amount: l.amount.toString(),
    })),
    lines: (lines ?? []).map((l) => ({
      amount: l.amount.toString(),
      currency: l.currency,
      categoryId: l.categoryId,
      categoryName: l.categoryName,
      subcategoryId: l.subcategoryId,
      subcategoryName: l.subcategoryName,
      tags: (tagsByLine.get(l.id) ?? []).map((t) => ({
        id: t.tagId,
        name: t.tagName,
      })),
    })),
    ...(balanceAfter !== undefined
      ? { balanceAfter: balanceAfter.toString() }
      : {}),
  };
}
