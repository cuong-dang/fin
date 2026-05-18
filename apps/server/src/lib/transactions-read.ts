import type { EnrichedTransaction } from "@fin/schemas";
import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, schema } from "../db/index.js";
import { groupBy } from "./collections.js";

async function fetchLegs(txIds: string[]) {
  if (txIds.length === 0) return [];
  return db
    .select({
      transactionId: schema.transactionLegs.transactionId,
      accountId: schema.transactionLegs.accountId,
      accountName: schema.accounts.name,
      accountCurrency: schema.accounts.currency,
      accountType: schema.accounts.type,
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
 * Bill names keyed by transaction id, for tx rows that link to a bill.
 * We don't filter `bills.deleted_at` — past transactions should still
 * surface their (now-deleted) bill's name.
 */
async function fetchBillsForTxs(txIds: string[]) {
  if (txIds.length === 0) return [];
  return db
    .select({
      txId: schema.transactions.id,
      billId: schema.bills.id,
      billName: schema.bills.name,
    })
    .from(schema.transactions)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.transactions.billId))
    .where(inArray(schema.transactions.id, txIds));
}

/**
 * Original-tx descriptions keyed by refund-tx id, used to render
 * "↶ Refund of <description>" without a second client fetch.
 */
async function fetchRefundedTxsForTxs(txIds: string[]) {
  if (txIds.length === 0) return [];
  const original = alias(schema.transactions, "original");
  return db
    .select({
      txId: schema.transactions.id,
      originalId: original.id,
      originalDescription: original.description,
    })
    .from(schema.transactions)
    .innerJoin(
      original,
      eq(original.id, schema.transactions.refundedTransactionId),
    )
    .where(inArray(schema.transactions.id, txIds));
}

type LegRow = Awaited<ReturnType<typeof fetchLegs>>[number];
type LineRow = Awaited<ReturnType<typeof fetchLines>>[number];
type LineTagRow = Awaited<ReturnType<typeof fetchLineTags>>[number];
type BillRow = Awaited<ReturnType<typeof fetchBillsForTxs>>[number];
type RefundedRow = Awaited<ReturnType<typeof fetchRefundedTxsForTxs>>[number];

export async function fetchLegsAndLines(txIds: string[]) {
  const [legRows, lineRows, billRows, refundedRows] = await Promise.all([
    fetchLegs(txIds),
    fetchLines(txIds),
    fetchBillsForTxs(txIds),
    fetchRefundedTxsForTxs(txIds),
  ]);
  const tagRows = await fetchLineTags(lineRows.map((l) => l.id));
  return {
    legsByTx: groupBy(legRows, (l) => l.transactionId),
    linesByTx: groupBy(lineRows, (l) => l.transactionId),
    tagsByLine: groupBy(tagRows, (t) => t.lineId),
    billByTx: new Map(billRows.map((b) => [b.txId, b])),
    refundedByTx: new Map(refundedRows.map((r) => [r.txId, r])),
  };
}

export function enrichTx(
  tx: {
    id: string;
    date: string | null;
    createdAt: Date;
    type: "income" | "expense" | "transfer" | "adjustment" | "refund";
    description: string | null;
    billId: string | null;
    refundedTransactionId: string | null;
  },
  legs: LegRow[] | undefined,
  lines: LineRow[] | undefined,
  tagsByLine: Map<string, LineTagRow[]>,
  bill: BillRow | undefined,
  refunded: RefundedRow | undefined,
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
    billId: tx.billId,
    billName: bill?.billName ?? null,
    refundedTransactionId: tx.refundedTransactionId,
    refundedTransactionDescription: refunded?.originalDescription ?? null,
    legs: legs.map((l) => ({
      accountId: l.accountId,
      accountName: l.accountName,
      accountCurrency: l.accountCurrency,
      accountType: l.accountType,
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
