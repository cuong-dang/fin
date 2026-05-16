/// <reference types="node" />
/**
 * Dev / demo seed.
 *
 * Wipes everything in the first user's workspace (accounts, categories,
 * tags, bills, loans, transactions) and writes ~7 months of realistic
 * activity that exercises every highlight feature:
 *
 *   - Multi-line splits (a Costco trip → Groceries / Pantry / Household).
 *   - Recurring bills with templates (utilities + subscriptions).
 *   - Credit-card accounts with monthly settlements (CASA → CC transfer).
 *   - An amortizing loan (mortgage) with interest + fees default lines,
 *     plus a smaller auto loan.
 *   - A loan-financed purchase (BNPL): expense leg lands on the loan
 *     account on the purchase day → shows up in by-category-&-tag
 *     immediately, but doesn't move cash flow until the loan is paid.
 *   - Tags (vacation / family / business / gift) on a sampling of lines.
 *   - One balance adjustment per account to establish opening balances.
 *   - Budgets covering under-pace, over-pace, and over-budget states.
 *
 * Reproducible: seeded PRNG so reruns produce the same dataset.
 *
 * Usage:
 *   pnpm db:seed                # uses .env.local DATABASE_URL
 *
 * Requires: at least one user + workspace_member row to exist. The
 * server auto-provisions both on first Google sign-in.
 */

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/db/schema.js";

// ─── Connection ───────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Run via `pnpm db:seed` (which loads .env.local).",
  );
}

// Neon's `-pooler` endpoint is PgBouncer in transaction mode. Even with
// `max: 1` on our side, consecutive auto-commit statements may be
// routed to different backends; a child INSERT can then land on a
// backend that hasn't yet seen the parent INSERT's commit, tripping
// the FK constraint. Swap to the direct (non-pooler) endpoint, which
// Neon's docs recommend for migrations and seeds.
const directUrl = DATABASE_URL.replace("-pooler", "");
const client = postgres(directUrl, { max: 1 });
const db = drizzle(client, { schema });

// ─── Constants & helpers ──────────────────────────────────────────────────

const CURRENCY = "USD";
const USD = (dollars: number) => BigInt(Math.round(dollars * 100));

// Seeded PRNG (mulberry32) so the dataset is deterministic across reruns.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRng(20260514);
const jitter = (base: number, frac = 0.15) =>
  base * (1 + (rand() - 0.5) * 2 * frac);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const pick = <T>(arr: readonly T[]): T => {
  const v = arr[Math.floor(rand() * arr.length)];
  if (v === undefined) throw new Error("Invariant: pick() from empty array");
  return v;
};
const sometimes = (p: number) => rand() < p;

function ymd(year: number, month1to12: number, day: number) {
  return `${year}-${String(month1to12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Sort-key counter per date (transactions.sort_key must be unique per
// workspace+date). We allocate 1..N as we generate.
const sortKeys = new Map<string, number>();
function nextSortKey(date: string) {
  const n = (sortKeys.get(date) ?? 0) + 1;
  sortKeys.set(date, n);
  return n;
}

// ─── Transaction insert ────────────────────────────────────────────────────

type Leg = { accountId: string; amount: bigint };
type Line = {
  categoryId: string;
  subcategoryId?: string | null;
  amount: bigint;
  tagIds?: string[];
};

async function insertTx(opts: {
  workspaceId: string;
  userId: string;
  date: string;
  type: "income" | "expense" | "transfer" | "adjustment";
  legs: Leg[];
  lines?: Line[];
  description?: string;
  billId?: string | null;
}) {
  const sortKey = nextSortKey(opts.date);
  // All four child writes (txn → legs → lines → line_tags) run inside
  // one PG transaction so the FK references resolve against the same
  // snapshot, immune to any cross-session visibility quirks.
  return db.transaction(async (txDb) => {
    const [tx] = await txDb
      .insert(schema.transactions)
      .values({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        date: opts.date,
        type: opts.type,
        sortKey,
        description: opts.description ?? null,
        billId: opts.billId ?? null,
      })
      .returning({ id: schema.transactions.id });
    if (!tx) throw new Error("Invariant: transaction insert returned nothing");

    await txDb.insert(schema.transactionLegs).values(
      opts.legs.map((l) => ({
        transactionId: tx.id,
        accountId: l.accountId,
        amount: l.amount,
      })),
    );

    const lines = opts.lines ?? [];
    if (lines.length > 0) {
      const lineRows = await txDb
        .insert(schema.transactionLines)
        .values(
          lines.map((l) => ({
            transactionId: tx.id,
            categoryId: l.categoryId,
            subcategoryId: l.subcategoryId ?? null,
            amount: l.amount,
            currency: CURRENCY,
          })),
        )
        .returning({ id: schema.transactionLines.id });
      const tagRows = lineRows.flatMap((row, i) => {
        const tagIds = lines[i]?.tagIds ?? [];
        return tagIds.map((tagId) => ({ lineId: row.id, tagId }));
      });
      if (tagRows.length > 0) {
        await txDb.insert(schema.transactionLineTags).values(tagRows);
      }
    }
    return tx.id;
  });
}

// ─── Reset ─────────────────────────────────────────────────────────────────

/**
 * Wipe workspace-scoped data (preserves users / workspaces / members).
 * Order matters because of FK restrict policies — see comments inline.
 */
async function resetWorkspace(workspaceId: string) {
  // Single PG transaction so every DELETE sees the prior ones'
  // results within the same snapshot — RESTRICT FKs won't trip on
  // stale rows that another session hasn't observed as gone yet.
  await db.transaction(async (tx) => {
    // Null out self-FKs so the cascade-delete of accounts doesn't hit
    // a RESTRICT (accounts.default_pay_from_account_id self-ref,
    // accounts.loan_id → loans RESTRICT).
    await tx.execute(sql`
      UPDATE accounts
      SET default_pay_from_account_id = NULL, loan_id = NULL
      WHERE account_group_id IN (
        SELECT id FROM account_groups WHERE workspace_id = ${workspaceId}
      )
    `);
    // Transactions cascade to legs, lines, line_tags via their FK chain.
    await tx
      .delete(schema.transactions)
      .where(eq(schema.transactions.workspaceId, workspaceId));
    // Budgets reference categories/subcategories — clear before categories.
    await tx
      .delete(schema.budgets)
      .where(eq(schema.budgets.workspaceId, workspaceId));
    // Bills cascade to bill_default_lines and bill_default_line_tags.
    await tx
      .delete(schema.bills)
      .where(eq(schema.bills.workspaceId, workspaceId));
    // Account groups cascade to accounts.
    await tx
      .delete(schema.accountGroups)
      .where(eq(schema.accountGroups.workspaceId, workspaceId));
    // Loans only deletable after accounts (accounts.loan_id RESTRICT).
    await tx
      .delete(schema.loans)
      .where(eq(schema.loans.workspaceId, workspaceId));
    // Categories cascade to subcategories.
    await tx
      .delete(schema.categories)
      .where(eq(schema.categories.workspaceId, workspaceId));
    await tx
      .delete(schema.tags)
      .where(eq(schema.tags.workspaceId, workspaceId));
  });
}

// ─── Reference data ────────────────────────────────────────────────────────

type CategoryTree = Record<string, string[]>;
const EXPENSE_TREE: CategoryTree = {
  Groceries: ["Produce", "Meat", "Pantry", "Snacks"],
  Dining: ["Restaurants", "Coffee", "Takeout"],
  Transportation: ["Gas", "Parking", "Rideshare"],
  Housing: ["Maintenance", "Property Tax"],
  Utilities: ["Electric", "Water", "Internet", "Gas"],
  Entertainment: ["Streaming", "Games", "Concerts"],
  Shopping: ["Clothing", "Electronics", "Household"],
  Health: ["Doctor", "Pharmacy", "Gym"],
  Travel: ["Flights", "Hotels", "Activities"],
  "Loan & Fees": ["Interest", "Fees"],
};
const INCOME_TREE: CategoryTree = {
  Salary: [],
  "Side Income": ["Freelance", "Refunds"],
  Investment: ["Dividends", "Interest Earned"],
};

type SubMap = Map<string, string>; // subcategoryName -> id
type CatRef = { id: string; subs: SubMap };
type Cats = Map<string, CatRef>; // categoryName -> CatRef

async function seedCategories(
  workspaceId: string,
  kind: "expense" | "income",
  tree: CategoryTree,
): Promise<Cats> {
  const out: Cats = new Map();
  for (const [name, subs] of Object.entries(tree)) {
    const [cat] = await db
      .insert(schema.categories)
      .values({ workspaceId, kind, name })
      .returning({ id: schema.categories.id });
    if (!cat) throw new Error("Invariant: category insert");
    const subMap: SubMap = new Map();
    if (subs.length > 0) {
      const subRows = await db
        .insert(schema.subcategories)
        .values(subs.map((sname) => ({ categoryId: cat.id, name: sname })))
        .returning({
          id: schema.subcategories.id,
          name: schema.subcategories.name,
        });
      for (const r of subRows) subMap.set(r.name, r.id);
    }
    out.set(name, { id: cat.id, subs: subMap });
  }
  return out;
}

function cat(cats: Cats, name: string) {
  const c = cats.get(name);
  if (!c) throw new Error(`Invariant: category not found: ${name}`);
  return c.id;
}
function sub(cats: Cats, catName: string, subName: string) {
  const c = cats.get(catName);
  if (!c) throw new Error(`Invariant: category not found: ${catName}`);
  const s = c.subs.get(subName);
  if (!s)
    throw new Error(`Invariant: subcategory not found: ${catName}/${subName}`);
  return s;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const userRows = await db.select().from(schema.users).limit(2);
  const user = userRows[0];
  if (!user) {
    throw new Error(
      "No users in the database. Sign in via the web app first so the server " +
        "auto-provisions a user + workspace, then re-run `pnpm db:seed`.",
    );
  }
  if (userRows.length > 1) {
    console.warn(
      `Multiple users found; seeding for the first one: ${user.email}`,
    );
  }
  const membership = (
    await db
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, user.id))
      .limit(1)
  )[0];
  if (!membership) {
    throw new Error(`User ${user.email} has no workspace membership.`);
  }
  const workspaceId = membership.workspaceId;
  const userId = user.id;
  console.log(
    `→ Seeding workspace=${workspaceId.slice(0, 8)}… user=${user.email}`,
  );

  await resetWorkspace(workspaceId);

  // Account groups:
  //   - "Spending" — everyday accounts (checking, CCs, BNPL, auto loan).
  //   - "Savings"  — long-term cash buffer.
  //   - "Excluded" — accounts tracked but kept out of net-worth and
  //     the everyday sidebar focus (the Mortgage lives here).
  const [spendingGroup] = await db
    .insert(schema.accountGroups)
    .values({ workspaceId, name: "Spending" })
    .returning({ id: schema.accountGroups.id });
  if (!spendingGroup) throw new Error("Invariant: spending group insert");
  const [savingsGroup] = await db
    .insert(schema.accountGroups)
    .values({ workspaceId, name: "Savings" })
    .returning({ id: schema.accountGroups.id });
  if (!savingsGroup) throw new Error("Invariant: savings group insert");
  const [excludedGroup] = await db
    .insert(schema.accountGroups)
    .values({ workspaceId, name: "Excluded" })
    .returning({ id: schema.accountGroups.id });
  if (!excludedGroup) throw new Error("Invariant: excluded group insert");

  // Loans first (accounts.loan_id references them)
  const [autoLoan] = await db
    .insert(schema.loans)
    .values({
      workspaceId,
      amountPerPeriod: USD(450),
      frequency: "monthly",
    })
    .returning({ id: schema.loans.id });
  const [mortgageLoan] = await db
    .insert(schema.loans)
    .values({
      workspaceId,
      amountPerPeriod: USD(2200),
      frequency: "monthly",
    })
    .returning({ id: schema.loans.id });
  const [affirmLoan] = await db
    .insert(schema.loans)
    .values({
      workspaceId,
      amountPerPeriod: USD(100),
      frequency: "biweekly",
    })
    .returning({ id: schema.loans.id });
  if (!autoLoan || !mortgageLoan || !affirmLoan)
    throw new Error("Invariant: loans insert");

  // Accounts (checking first — others reference it as default_pay_from)
  const [checking] = await db
    .insert(schema.accounts)
    .values({
      accountGroupId: spendingGroup.id,
      name: "Chase Checking",
      currency: CURRENCY,
      type: "checking_savings",
    })
    .returning({ id: schema.accounts.id });
  if (!checking) throw new Error("Invariant: checking insert");

  const [savings] = await db
    .insert(schema.accounts)
    .values({
      accountGroupId: savingsGroup.id,
      name: "Marcus Savings",
      currency: CURRENCY,
      type: "checking_savings",
    })
    .returning({ id: schema.accounts.id });
  const [sapphire] = await db
    .insert(schema.accounts)
    .values({
      accountGroupId: spendingGroup.id,
      name: "Chase Sapphire",
      currency: CURRENCY,
      type: "credit_card",
      creditLimit: USD(15_000),
      defaultPayFromAccountId: checking.id,
    })
    .returning({ id: schema.accounts.id });
  const [amex] = await db
    .insert(schema.accounts)
    .values({
      accountGroupId: spendingGroup.id,
      name: "Amex Gold",
      currency: CURRENCY,
      type: "credit_card",
      creditLimit: USD(25_000),
      defaultPayFromAccountId: checking.id,
    })
    .returning({ id: schema.accounts.id });
  const [autoAcct] = await db
    .insert(schema.accounts)
    .values({
      accountGroupId: spendingGroup.id,
      name: "Auto Loan",
      currency: CURRENCY,
      type: "loan",
      defaultPayFromAccountId: checking.id,
      loanId: autoLoan.id,
    })
    .returning({ id: schema.accounts.id });
  const [mortgageAcct] = await db
    .insert(schema.accounts)
    .values({
      accountGroupId: excludedGroup.id,
      name: "Mortgage",
      currency: CURRENCY,
      type: "loan",
      defaultPayFromAccountId: checking.id,
      loanId: mortgageLoan.id,
      // Exclude from net worth so the chart isn't dominated by the
      // mortgage liability — and so the "exclude from net worth"
      // feature has a live example in the demo data.
      excludeFromNetWorth: true,
    })
    .returning({ id: schema.accounts.id });
  const [affirmAcct] = await db
    .insert(schema.accounts)
    .values({
      accountGroupId: spendingGroup.id,
      name: "Affirm BNPL",
      currency: CURRENCY,
      type: "loan",
      defaultPayFromAccountId: checking.id,
      loanId: affirmLoan.id,
    })
    .returning({ id: schema.accounts.id });
  if (
    !savings ||
    !sapphire ||
    !amex ||
    !autoAcct ||
    !mortgageAcct ||
    !affirmAcct
  )
    throw new Error("Invariant: account inserts");

  // Categories
  const expense = await seedCategories(workspaceId, "expense", EXPENSE_TREE);
  const income = await seedCategories(workspaceId, "income", INCOME_TREE);

  // Tags
  const tagNames = ["family", "business", "vacation", "gift"];
  const tagRows = await db
    .insert(schema.tags)
    .values(tagNames.map((name) => ({ workspaceId, name })))
    .returning({ id: schema.tags.id, name: schema.tags.name });
  const tag = new Map(tagRows.map((r) => [r.name, r.id]));

  // Bills (+ default lines)
  async function addBill(opts: {
    name: string;
    type: "utility" | "subscription" | "other";
    frequency: "monthly" | "yearly";
    defaultPayFromAccountId: string;
    lines: {
      categoryId: string;
      subcategoryId?: string | null;
      amount: bigint;
    }[];
  }) {
    const [bill] = await db
      .insert(schema.bills)
      .values({
        workspaceId,
        name: opts.name,
        type: opts.type,
        frequency: opts.frequency,
        defaultPayFromAccountId: opts.defaultPayFromAccountId,
        currency: CURRENCY,
      })
      .returning({ id: schema.bills.id });
    if (!bill) throw new Error("Invariant: bill insert");
    await db.insert(schema.billDefaultLines).values(
      opts.lines.map((l) => ({
        billId: bill.id,
        categoryId: l.categoryId,
        subcategoryId: l.subcategoryId ?? null,
        amount: l.amount,
      })),
    );
    return bill.id;
  }

  const billElectric = await addBill({
    name: "Electric",
    type: "utility",
    frequency: "monthly",
    defaultPayFromAccountId: checking.id,
    lines: [
      {
        categoryId: cat(expense, "Utilities"),
        subcategoryId: sub(expense, "Utilities", "Electric"),
        amount: USD(120),
      },
    ],
  });
  const billWater = await addBill({
    name: "Water",
    type: "utility",
    frequency: "monthly",
    defaultPayFromAccountId: checking.id,
    lines: [
      {
        categoryId: cat(expense, "Utilities"),
        subcategoryId: sub(expense, "Utilities", "Water"),
        amount: USD(45),
      },
    ],
  });
  const billInternet = await addBill({
    name: "Internet",
    type: "utility",
    frequency: "monthly",
    defaultPayFromAccountId: checking.id,
    lines: [
      {
        categoryId: cat(expense, "Utilities"),
        subcategoryId: sub(expense, "Utilities", "Internet"),
        amount: USD(80),
      },
    ],
  });
  const billNetflix = await addBill({
    name: "Netflix",
    type: "subscription",
    frequency: "monthly",
    defaultPayFromAccountId: amex.id,
    lines: [
      {
        categoryId: cat(expense, "Entertainment"),
        subcategoryId: sub(expense, "Entertainment", "Streaming"),
        amount: USD(15.49),
      },
    ],
  });
  const billSpotify = await addBill({
    name: "Spotify",
    type: "subscription",
    frequency: "monthly",
    defaultPayFromAccountId: amex.id,
    lines: [
      {
        categoryId: cat(expense, "Entertainment"),
        subcategoryId: sub(expense, "Entertainment", "Streaming"),
        amount: USD(11.99),
      },
    ],
  });
  const billGym = await addBill({
    name: "Gym",
    type: "subscription",
    frequency: "monthly",
    defaultPayFromAccountId: sapphire.id,
    lines: [
      {
        categoryId: cat(expense, "Health"),
        subcategoryId: sub(expense, "Health", "Gym"),
        amount: USD(49),
      },
    ],
  });
  const billCostco = await addBill({
    name: "Costco Membership",
    type: "other",
    frequency: "yearly",
    defaultPayFromAccountId: checking.id,
    lines: [
      {
        categoryId: cat(expense, "Shopping"),
        subcategoryId: sub(expense, "Shopping", "Household"),
        amount: USD(60),
      },
    ],
  });

  // Budgets — picked to exercise all three pace/cap bands when viewed
  // at the seed's "today" of 2026-05-14 (~45% through the May cycle):
  //
  //   teal   (under pace)        actual <  45% × cap
  //   yellow (over pace, in cap) actual >= 45% but < 100% × cap
  //   red    (over budget)       actual >= 100% × cap
  //
  // The two Utilities subcategory budgets also produce a rollup row
  // (`Σ` icon) at the Utilities parent.
  await db.insert(schema.budgets).values([
    // Under pace: ~$150 spent on Groceries (2 trips) vs $316 pace target.
    {
      workspaceId,
      categoryId: cat(expense, "Groceries"),
      amount: USD(700),
      currency: CURRENCY,
      frequency: "monthly",
    },
    // Over pace, under cap: water ~$45 vs $60 cap (pace target ~$27).
    {
      workspaceId,
      subcategoryId: sub(expense, "Utilities", "Water"),
      amount: USD(60),
      currency: CURRENCY,
      frequency: "monthly",
    },
    // Over budget: streaming $27.48 (Netflix + Spotify) vs $20 cap.
    {
      workspaceId,
      subcategoryId: sub(expense, "Entertainment", "Streaming"),
      amount: USD(20),
      currency: CURRENCY,
      frequency: "monthly",
    },
    // Over budget: electric ~$120 vs $80 cap.
    {
      workspaceId,
      subcategoryId: sub(expense, "Utilities", "Electric"),
      amount: USD(80),
      currency: CURRENCY,
      frequency: "monthly",
    },
  ]);

  // Loan default lines (interest + fees portion; principal = leg − Σ lines)
  await db.insert(schema.loanDefaultLines).values([
    {
      loanId: autoLoan.id,
      categoryId: cat(expense, "Loan & Fees"),
      subcategoryId: sub(expense, "Loan & Fees", "Interest"),
      amount: USD(50),
    },
    {
      loanId: mortgageLoan.id,
      categoryId: cat(expense, "Loan & Fees"),
      subcategoryId: sub(expense, "Loan & Fees", "Interest"),
      amount: USD(1500),
    },
    {
      loanId: mortgageLoan.id,
      categoryId: cat(expense, "Loan & Fees"),
      subcategoryId: sub(expense, "Loan & Fees", "Fees"),
      amount: USD(50),
    },
    // Affirm is 0% — no default lines.
  ]);

  // ─── Transactions ──────────────────────────────────────────────────────

  const ctx = { workspaceId, userId };

  // Opening balances (one adjustment per account, 2025-10-31)
  const open = "2025-10-31";
  await insertTx({
    ...ctx,
    date: open,
    type: "adjustment",
    legs: [{ accountId: checking.id, amount: USD(8_000) }],
    description: "Opening balance",
  });
  await insertTx({
    ...ctx,
    date: open,
    type: "adjustment",
    legs: [{ accountId: savings.id, amount: USD(15_000) }],
    description: "Opening balance",
  });
  await insertTx({
    ...ctx,
    date: open,
    type: "adjustment",
    legs: [{ accountId: mortgageAcct.id, amount: USD(-280_000) }],
    description: "Mortgage opening balance",
  });
  await insertTx({
    ...ctx,
    date: open,
    type: "adjustment",
    legs: [{ accountId: autoAcct.id, amount: USD(-22_000) }],
    description: "Auto loan opening balance",
  });

  // Helpers tied to ctx + accounts above
  type Bill = string;

  async function salary(date: string) {
    await insertTx({
      ...ctx,
      date,
      type: "income",
      legs: [{ accountId: checking.id, amount: USD(6_500) }],
      lines: [{ categoryId: cat(income, "Salary"), amount: USD(6_500) }],
      description: "Paycheck",
    });
  }

  // For loan payments, the destination leg carries the *principal*
  // portion only (= total payment − Σ line amounts). Interest and fees
  // leave the system as categorized expense, not as principal credited
  // to the loan. Without this split, net worth would treat interest
  // dollars as if they came back as reduced debt.
  async function mortgagePayment(date: string) {
    const interest = USD(1_500);
    const fees = USD(50);
    const payment = USD(2_200);
    const principal = payment - (interest + fees);
    await insertTx({
      ...ctx,
      date,
      type: "transfer",
      legs: [
        { accountId: checking.id, amount: -payment },
        { accountId: mortgageAcct.id, amount: principal },
      ],
      lines: [
        {
          categoryId: cat(expense, "Loan & Fees"),
          subcategoryId: sub(expense, "Loan & Fees", "Interest"),
          amount: interest,
        },
        {
          categoryId: cat(expense, "Loan & Fees"),
          subcategoryId: sub(expense, "Loan & Fees", "Fees"),
          amount: fees,
        },
      ],
      description: "Mortgage payment",
    });
  }

  async function autoPayment(date: string) {
    const interest = USD(50);
    const payment = USD(450);
    const principal = payment - interest;
    await insertTx({
      ...ctx,
      date,
      type: "transfer",
      legs: [
        { accountId: checking.id, amount: -payment },
        { accountId: autoAcct.id, amount: principal },
      ],
      lines: [
        {
          categoryId: cat(expense, "Loan & Fees"),
          subcategoryId: sub(expense, "Loan & Fees", "Interest"),
          amount: interest,
        },
      ],
      description: "Auto loan payment",
    });
  }

  async function billCharge(
    date: string,
    billId: Bill,
    accountId: string,
    amount: bigint,
    line: { categoryId: string; subcategoryId?: string | null },
    description: string,
  ) {
    await insertTx({
      ...ctx,
      date,
      type: "expense",
      legs: [{ accountId, amount: -amount }],
      lines: [
        {
          categoryId: line.categoryId,
          subcategoryId: line.subcategoryId ?? null,
          amount,
        },
      ],
      description,
      billId,
    });
  }

  // Track CC balances in cents so we can size monthly payments dynamically.
  const balance = new Map<string, bigint>();
  const moveBalance = (id: string, delta: bigint) =>
    balance.set(id, (balance.get(id) ?? 0n) + delta);

  // Wrap insertTx so balance tracking stays in sync for CC accounts.
  const baseInsert = insertTx;
  async function tx(opts: Parameters<typeof baseInsert>[0]) {
    for (const l of opts.legs) {
      if (l.accountId === sapphire.id || l.accountId === amex.id) {
        moveBalance(l.accountId, l.amount);
      }
    }
    return baseInsert(opts);
  }

  // Wrappers that go through the balance-tracking tx()
  async function ccExpense(opts: {
    date: string;
    accountId: string;
    amount: bigint;
    lines: Line[];
    description?: string;
  }) {
    return tx({
      ...ctx,
      date: opts.date,
      type: "expense",
      legs: [{ accountId: opts.accountId, amount: -opts.amount }],
      lines: opts.lines,
      ...(opts.description !== undefined && { description: opts.description }),
    });
  }

  async function ccPayment(date: string, ccId: string, amount: bigint) {
    await tx({
      ...ctx,
      date,
      type: "transfer",
      legs: [
        { accountId: checking.id, amount: -amount },
        { accountId: ccId, amount },
      ],
      description: ccId === sapphire.id ? "Pay Sapphire" : "Pay Amex",
    });
  }

  // ─── Per-month generator ───────────────────────────────────────────────

  async function seedMonth(
    year: number,
    month: number,
    opts: { partial?: number } = {},
  ) {
    const lastDay = opts.partial ?? new Date(year, month, 0).getDate(); // month is 1-12

    // Salary 1st and 15th
    if (lastDay >= 1) await salary(ymd(year, month, 1));
    if (lastDay >= 15) await salary(ymd(year, month, 15));

    // Mortgage 1st
    if (lastDay >= 1) await mortgagePayment(ymd(year, month, 1));

    // Auto loan 5th
    if (lastDay >= 5) await autoPayment(ymd(year, month, 5));

    // Subscription bills (early in month, mostly on CC)
    if (lastDay >= 3)
      await billCharge(
        ymd(year, month, 3),
        billGym,
        sapphire.id,
        USD(49),
        {
          categoryId: cat(expense, "Health"),
          subcategoryId: sub(expense, "Health", "Gym"),
        },
        "Gym",
      );
    if (lastDay >= 6)
      await billCharge(
        ymd(year, month, 6),
        billNetflix,
        amex.id,
        USD(15.49),
        {
          categoryId: cat(expense, "Entertainment"),
          subcategoryId: sub(expense, "Entertainment", "Streaming"),
        },
        "Netflix",
      );
    if (lastDay >= 8)
      await billCharge(
        ymd(year, month, 8),
        billSpotify,
        amex.id,
        USD(11.99),
        {
          categoryId: cat(expense, "Entertainment"),
          subcategoryId: sub(expense, "Entertainment", "Streaming"),
        },
        "Spotify",
      );

    // Utility bills (variable amount; auto-paid from checking)
    if (lastDay >= 10)
      await billCharge(
        ymd(year, month, 10),
        billElectric,
        checking.id,
        USD(jitter(120, 0.3)),
        {
          categoryId: cat(expense, "Utilities"),
          subcategoryId: sub(expense, "Utilities", "Electric"),
        },
        "Electric",
      );
    if (lastDay >= 12)
      await billCharge(
        ymd(year, month, 12),
        billWater,
        checking.id,
        USD(jitter(45, 0.25)),
        {
          categoryId: cat(expense, "Utilities"),
          subcategoryId: sub(expense, "Utilities", "Water"),
        },
        "Water",
      );
    if (lastDay >= 15)
      await billCharge(
        ymd(year, month, 15),
        billInternet,
        checking.id,
        USD(80),
        {
          categoryId: cat(expense, "Utilities"),
          subcategoryId: sub(expense, "Utilities", "Internet"),
        },
        "Internet",
      );

    // Groceries: 4-5 trips on Sapphire, one of them is a multi-line split.
    const groceryDays = [4, 11, 18, 24].filter((d) => d <= lastDay);
    for (const d of groceryDays) {
      const date = ymd(year, month, d);
      const isSplit = d === 18 && lastDay >= 18; // monthly Costco trip
      if (isSplit) {
        const produce = USD(42 + between(-8, 12));
        const pantry = USD(35 + between(-5, 10));
        const household = USD(20 + between(-3, 6));
        await ccExpense({
          date,
          accountId: sapphire.id,
          amount: produce + pantry + household,
          lines: [
            {
              categoryId: cat(expense, "Groceries"),
              subcategoryId: sub(expense, "Groceries", "Produce"),
              amount: produce,
              tagIds: [tag.get("family")!],
            },
            {
              categoryId: cat(expense, "Groceries"),
              subcategoryId: sub(expense, "Groceries", "Pantry"),
              amount: pantry,
              tagIds: [tag.get("family")!],
            },
            {
              categoryId: cat(expense, "Shopping"),
              subcategoryId: sub(expense, "Shopping", "Household"),
              amount: household,
            },
          ],
          description: "Costco",
        });
      } else {
        const subName = pick(["Produce", "Meat", "Pantry", "Snacks"] as const);
        const amount = USD(jitter(75, 0.4));
        await ccExpense({
          date,
          accountId: sapphire.id,
          amount,
          lines: [
            {
              categoryId: cat(expense, "Groceries"),
              subcategoryId: sub(expense, "Groceries", subName),
              amount,
              ...(sometimes(0.7) && { tagIds: [tag.get("family")!] }),
            },
          ],
          description: pick(["Whole Foods", "Trader Joe's", "Safeway"]),
        });
      }
    }

    // Dining: 5-7 transactions, varied
    const diningDays = [2, 7, 9, 13, 17, 21, 26, 28].filter(
      (d) => d <= lastDay,
    );
    for (const d of diningDays.slice(0, 5 + Math.floor(rand() * 3))) {
      const date = ymd(year, month, d);
      const subName = pick(["Restaurants", "Coffee", "Takeout"] as const);
      const base = subName === "Coffee" ? 7 : subName === "Takeout" ? 24 : 52;
      const amount = USD(jitter(base, 0.35));
      const businessish = sometimes(0.15);
      await ccExpense({
        date,
        accountId: amex.id,
        amount,
        lines: [
          {
            categoryId: cat(expense, "Dining"),
            subcategoryId: sub(expense, "Dining", subName),
            amount,
            ...(businessish && { tagIds: [tag.get("business")!] }),
          },
        ],
        description:
          subName === "Coffee"
            ? pick(["Blue Bottle", "Starbucks", "Local cafe"])
            : subName === "Takeout"
              ? pick(["DoorDash", "Uber Eats"])
              : pick(["Sushi", "Italian", "Thai", "Steakhouse"]),
      });
    }

    // Gas: 2-3 fillups
    const gasDays = [6, 16, 25].filter((d) => d <= lastDay);
    for (const d of gasDays.slice(0, 2 + Math.floor(rand() * 2))) {
      const date = ymd(year, month, d);
      const amount = USD(jitter(48, 0.2));
      await ccExpense({
        date,
        accountId: sapphire.id,
        amount,
        lines: [
          {
            categoryId: cat(expense, "Transportation"),
            subcategoryId: sub(expense, "Transportation", "Gas"),
            amount,
          },
        ],
        description: pick(["Shell", "Chevron", "Costco Gas"]),
      });
    }

    // One health expense (pharmacy or doctor copay)
    if (lastDay >= 14 && sometimes(0.8)) {
      const isPharm = sometimes(0.6);
      const amount = USD(isPharm ? jitter(18, 0.5) : jitter(40, 0.3));
      const date = ymd(year, month, 14);
      await ccExpense({
        date,
        accountId: amex.id,
        amount,
        lines: [
          {
            categoryId: cat(expense, "Health"),
            subcategoryId: sub(
              expense,
              "Health",
              isPharm ? "Pharmacy" : "Doctor",
            ),
            amount,
          },
        ],
        description: isPharm ? "CVS" : "Doctor visit",
      });
    }

    // One random shopping line (clothing or electronics)
    if (lastDay >= 19 && sometimes(0.7)) {
      const subName = pick(["Clothing", "Electronics"] as const);
      const amount = USD(jitter(subName === "Clothing" ? 65 : 120, 0.4));
      await ccExpense({
        date: ymd(year, month, 19),
        accountId: amex.id,
        amount,
        lines: [
          {
            categoryId: cat(expense, "Shopping"),
            subcategoryId: sub(expense, "Shopping", subName),
            amount,
          },
        ],
        description: subName,
      });
    }

    // Transfer to savings on the 20th
    if (lastDay >= 20) {
      const amount = USD(800);
      await tx({
        ...ctx,
        date: ymd(year, month, 20),
        type: "transfer",
        legs: [
          { accountId: checking.id, amount: -amount },
          { accountId: savings.id, amount },
        ],
        description: "Move to savings",
      });
    }

    // End-of-month CC payments — clear ~85% of accumulated balance, leave a carry.
    if (lastDay >= 25) {
      for (const ccId of [sapphire.id, amex.id]) {
        const bal = balance.get(ccId) ?? 0n; // negative number (cents)
        if (bal < 0n) {
          // Pay ~85% of the absolute value, rounded to the dollar.
          const owed = -bal;
          const payCents = (owed * 85n) / 100n;
          const payDollars = (payCents / 100n) * 100n; // round down to dollar
          if (payDollars > 0n)
            await ccPayment(ymd(year, month, 25), ccId, payDollars);
        }
      }
    }
  }

  // Months: Nov 2025 → May 2026 (May only through the 14th)
  await seedMonth(2025, 11);
  await seedMonth(2025, 12);
  await seedMonth(2026, 1);

  // Costco yearly renewal in Jan
  await billCharge(
    "2026-01-15",
    billCostco,
    checking.id,
    USD(60),
    {
      categoryId: cat(expense, "Shopping"),
      subcategoryId: sub(expense, "Shopping", "Household"),
    },
    "Costco Membership",
  );

  // Feb 2026 — vacation week (tagged)
  await seedMonth(2026, 2);
  await tx({
    ...ctx,
    date: "2026-02-17",
    type: "expense",
    legs: [{ accountId: amex.id, amount: USD(-420) }],
    lines: [
      {
        categoryId: cat(expense, "Travel"),
        subcategoryId: sub(expense, "Travel", "Flights"),
        amount: USD(420),
        tagIds: [tag.get("vacation")!],
      },
    ],
    description: "Flights to Denver",
  });
  await tx({
    ...ctx,
    date: "2026-02-18",
    type: "expense",
    legs: [{ accountId: amex.id, amount: USD(-1_180) }],
    lines: [
      {
        categoryId: cat(expense, "Travel"),
        subcategoryId: sub(expense, "Travel", "Hotels"),
        amount: USD(1_180),
        tagIds: [tag.get("vacation")!],
      },
    ],
    description: "Hotel Denver",
  });
  await tx({
    ...ctx,
    date: "2026-02-19",
    type: "expense",
    legs: [{ accountId: amex.id, amount: USD(-220) }],
    lines: [
      {
        categoryId: cat(expense, "Travel"),
        subcategoryId: sub(expense, "Travel", "Activities"),
        amount: USD(220),
        tagIds: [tag.get("vacation")!],
      },
    ],
    description: "Ski rentals + lift tickets",
  });

  // March 2026
  await seedMonth(2026, 3);

  // BNPL: $400 couch on Affirm (financed purchase). Demonstrates that
  // category spending sees it on the purchase day while cash flow only
  // sees the eventual payments.
  await insertTx({
    ...ctx,
    date: "2026-03-08",
    type: "expense",
    legs: [{ accountId: affirmAcct.id, amount: USD(-400) }],
    lines: [
      {
        categoryId: cat(expense, "Shopping"),
        subcategoryId: sub(expense, "Shopping", "Household"),
        amount: USD(400),
      },
    ],
    description: "Couch (Affirm BNPL)",
  });
  // Biweekly Affirm payments: $100 each — 4 of them clear over the next ~8 weeks.
  for (const date of ["2026-03-22", "2026-04-05", "2026-04-19", "2026-05-03"]) {
    await insertTx({
      ...ctx,
      date,
      type: "transfer",
      legs: [
        { accountId: checking.id, amount: USD(-100) },
        { accountId: affirmAcct.id, amount: USD(100) },
      ],
      description: "Affirm payment",
    });
  }

  // April 2026
  await seedMonth(2026, 4);
  // Freelance side income
  await insertTx({
    ...ctx,
    date: "2026-04-22",
    type: "income",
    legs: [{ accountId: checking.id, amount: USD(500) }],
    lines: [
      {
        categoryId: cat(income, "Side Income"),
        subcategoryId: sub(income, "Side Income", "Freelance"),
        amount: USD(500),
        tagIds: [tag.get("business")!],
      },
    ],
    description: "Freelance gig",
  });

  // Savings interest (adjustment — represents a real bank-credited interest)
  await insertTx({
    ...ctx,
    date: "2026-04-30",
    type: "adjustment",
    legs: [{ accountId: savings.id, amount: USD(38.42) }],
    description: "Marcus monthly interest",
  });

  // May 2026 (partial through May 14)
  await seedMonth(2026, 5, { partial: 14 });

  // A small gift purchase to demonstrate the gift tag
  await tx({
    ...ctx,
    date: "2026-05-10",
    type: "expense",
    legs: [{ accountId: amex.id, amount: USD(-85) }],
    lines: [
      {
        categoryId: cat(expense, "Shopping"),
        subcategoryId: sub(expense, "Shopping", "Clothing"),
        amount: USD(85),
        tagIds: [tag.get("gift")!],
      },
    ],
    description: "Mother's Day gift",
  });

  // ─── Summary ───────────────────────────────────────────────────────────

  const counts = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM transactions WHERE workspace_id = ${workspaceId}) AS transactions,
      (SELECT count(*) FROM transaction_legs WHERE transaction_id IN (SELECT id FROM transactions WHERE workspace_id = ${workspaceId})) AS legs,
      (SELECT count(*) FROM transaction_lines WHERE transaction_id IN (SELECT id FROM transactions WHERE workspace_id = ${workspaceId})) AS lines,
      (SELECT count(*) FROM accounts WHERE account_group_id IN (SELECT id FROM account_groups WHERE workspace_id = ${workspaceId})) AS accounts,
      (SELECT count(*) FROM bills WHERE workspace_id = ${workspaceId}) AS bills,
      (SELECT count(*) FROM loans WHERE workspace_id = ${workspaceId}) AS loans,
      (SELECT count(*) FROM categories WHERE workspace_id = ${workspaceId}) AS categories,
      (SELECT count(*) FROM budgets WHERE workspace_id = ${workspaceId}) AS budgets
  `);
  console.log("✔ Seed complete");
  console.log(counts[0]);
}

main()
  .then(() => client.end())
  .catch((err) => {
    console.error(err);
    client.end().finally(() => process.exit(1));
  });
