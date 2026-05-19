/**
 * Test-only seed + cleanup helpers. Designed for the cash-flow /
 * analytics test suite: every seeder takes the minimum it needs and
 * returns the new row's id. Composition stays explicit at the call
 * site so each test reads as "given this exact world, the handler
 * returned X."
 *
 * Cleanup is always TRUNCATE-everything in `beforeEach` — small data
 * sets, fast enough, and avoids any cross-test interaction.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { db, schema } from "../db/index.js";

/** TRUNCATE every data table. RESTART IDENTITY isn't needed (all PKs
 * are UUIDs), but CASCADE is — refunds reference transactions, lines
 * reference categories, etc. */
export async function truncateAll() {
  // Order matters only as a documentation hint; CASCADE handles the
  // actual dependency walk.
  await db.execute(sql`
    TRUNCATE
      transaction_line_tags,
      transaction_lines,
      transaction_legs,
      transactions,
      bill_default_line_tags,
      bill_default_lines,
      bills,
      loan_default_line_tags,
      loan_default_lines,
      accounts,
      loans,
      account_groups,
      subcategories,
      categories,
      tags,
      budgets,
      workspace_members,
      workspaces,
      users
    CASCADE
  `);
}

// ─── Workspace + user ────────────────────────────────────────────────────

export async function seedWorkspaceAndUser(): Promise<{
  workspaceId: string;
  userId: string;
}> {
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `test-${randomUUID()}@example.com`,
      name: "Test User",
    })
    .returning({ id: schema.users.id });
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: "Test Workspace" })
    .returning({ id: schema.workspaces.id });
  await db.insert(schema.workspaceMembers).values({
    workspaceId: ws!.id,
    userId: user!.id,
    role: "owner",
  });
  return { workspaceId: ws!.id, userId: user!.id };
}

// ─── Accounts ────────────────────────────────────────────────────────────

export async function seedAccountGroup(
  workspaceId: string,
  name = "Spending",
): Promise<string> {
  const [row] = await db
    .insert(schema.accountGroups)
    .values({ workspaceId, name })
    .returning({ id: schema.accountGroups.id });
  return row!.id;
}

export type SeedAccountOpts = {
  workspaceId: string;
  accountGroupId: string;
  name: string;
  type: "checking_savings" | "credit_card" | "loan";
  currency?: string;
  creditLimit?: bigint;
  loanId?: string;
};

export async function seedAccount(opts: SeedAccountOpts): Promise<string> {
  const [row] = await db
    .insert(schema.accounts)
    .values({
      accountGroupId: opts.accountGroupId,
      name: opts.name,
      currency: opts.currency ?? "USD",
      type: opts.type,
      creditLimit: opts.creditLimit ?? null,
      loanId: opts.loanId ?? null,
    })
    .returning({ id: schema.accounts.id });
  return row!.id;
}

// ─── Categories ──────────────────────────────────────────────────────────

export async function seedCategory(
  workspaceId: string,
  name: string,
  kind: "expense" | "income",
): Promise<string> {
  const [row] = await db
    .insert(schema.categories)
    .values({ workspaceId, name, kind })
    .returning({ id: schema.categories.id });
  return row!.id;
}

export async function seedSubcategory(
  categoryId: string,
  name: string,
): Promise<string> {
  const [row] = await db
    .insert(schema.subcategories)
    .values({ categoryId, name })
    .returning({ id: schema.subcategories.id });
  return row!.id;
}

// ─── Transactions ────────────────────────────────────────────────────────

export type SeedTxOpts = {
  workspaceId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  type: "income" | "expense" | "transfer" | "adjustment" | "refund";
  description?: string;
  billId?: string;
  refundedTransactionId?: string;
  legs: { accountId: string; amount: bigint }[];
  lines?: {
    categoryId: string;
    subcategoryId?: string;
    amount: bigint;
    currency?: string;
  }[];
};

/** Insert a transaction + its legs + its lines in one shot. sort_key
 * is allocated as `count + 1` per date — keeps it simple for tests
 * (which rarely care about within-day order). */
export async function seedTransaction(opts: SeedTxOpts): Promise<string> {
  const sortKey = await nextSortKeyForTest(opts.workspaceId, opts.date);
  const [tx] = await db
    .insert(schema.transactions)
    .values({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      date: opts.date,
      type: opts.type,
      sortKey,
      description: opts.description ?? null,
      billId: opts.billId ?? null,
      refundedTransactionId: opts.refundedTransactionId ?? null,
    })
    .returning({ id: schema.transactions.id });

  await db.insert(schema.transactionLegs).values(
    opts.legs.map((l) => ({
      transactionId: tx!.id,
      accountId: l.accountId,
      amount: l.amount,
    })),
  );

  if (opts.lines?.length) {
    await db.insert(schema.transactionLines).values(
      opts.lines.map((l) => ({
        transactionId: tx!.id,
        categoryId: l.categoryId,
        subcategoryId: l.subcategoryId ?? null,
        amount: l.amount,
        currency: l.currency ?? "USD",
      })),
    );
  }

  return tx!.id;
}

async function nextSortKeyForTest(
  workspaceId: string,
  date: string,
): Promise<number> {
  const [row] = await db.execute<{ max: number | null }>(sql`
    SELECT MAX(sort_key) AS max FROM transactions
    WHERE workspace_id = ${workspaceId} AND date = ${date}
  `);
  return (row?.max ?? 0) + 1;
}

// ─── Tiny money helper ──────────────────────────────────────────────────

/** Convert a plain dollar number to USD minor units (cents) as bigint.
 * Tests stay readable: `usd(30)` instead of `3000n`. */
export const usd = (dollars: number) => BigInt(Math.round(dollars * 100));
