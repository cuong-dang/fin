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
      transactionId: schema.transactionLines.transactionId,
      amount: schema.transactionLines.amount,
      currency: schema.transactionLines.currency,
      categoryId: schema.transactionLines.categoryId,
      categoryName: schema.categories.name,
      subcategoryId: schema.transactionLines.subcategoryId,
      subcategoryName: schema.subcategories.name,
      tagId: schema.transactionLines.tagId,
      tagName: schema.tags.name,
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
    .leftJoin(schema.tags, eq(schema.tags.id, schema.transactionLines.tagId))
    .where(inArray(schema.transactionLines.transactionId, txIds));
}

type LegRow = Awaited<ReturnType<typeof fetchLegs>>[number];
type LineRow = Awaited<ReturnType<typeof fetchLines>>[number];

export async function fetchLegsAndLines(txIds: string[]) {
  const [legRows, lineRows] = await Promise.all([
    fetchLegs(txIds),
    fetchLines(txIds),
  ]);
  return {
    legsByTx: groupBy(legRows, (l) => l.transactionId),
    linesByTx: groupBy(lineRows, (l) => l.transactionId),
  };
}

export function enrichTx(
  tx: {
    id: string;
    date: string | null;
    createdAt: Date;
    type: "income" | "expense" | "transfer" | "adjustment";
    description: string | null;
  },
  legs: LegRow[] | undefined,
  lines: LineRow[] | undefined,
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
      tagId: l.tagId,
      tagName: l.tagName,
    })),
    ...(balanceAfter !== undefined
      ? { balanceAfter: balanceAfter.toString() }
      : {}),
  };
}
