/**
 * Cash-flow analytics — integration tests against a real Postgres
 * spun up via testcontainers (see `test/setup.ts`). Each test seeds
 * the minimum data it needs, runs the corresponding `runCashFlow`
 * dimension, and asserts on the wire response.
 *
 * Conventions:
 *   - One workspace per test (via `seedWorkspaceAndUser`); analytics
 *     filter by workspaceId, so beforeEach TRUNCATE is paranoia
 *     rather than necessity — kept anyway to make any cross-test
 *     leak loud.
 *   - All amounts USD, two-decimal. `usd(30)` = 3000n minor units.
 *   - Tests assert on `buckets` (period → series → number) rather
 *     than on the SQL aggregate shape, so they don't break if
 *     handlers change query strategy.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  seedAccount,
  seedAccountGroup,
  seedCategory,
  seedSubcategory,
  seedTransaction,
  seedWorkspaceAndUser,
  truncateAll,
  usd,
} from "../test/helpers.js";
import { runCashFlow } from "./analytics.js";

const WINDOW = { start: "2026-03-01", end: "2026-03-31" } as const;

describe("runCashFlow — outTop (3-bucket monthly)", () => {
  beforeEach(truncateAll);

  it("sums expenses, loan payments, and bill charges into separate buckets", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const loanAcct = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Mortgage",
      type: "loan",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");
    const utilities = await seedCategory(workspaceId, "Utilities", "expense");

    // Plain expense: $30 grocery on 2026-03-10.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });

    // Loan payment: $200 transfer from checking → mortgage on 2026-03-15.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "transfer",
      legs: [
        { accountId: checking, amount: -usd(200) },
        { accountId: loanAcct, amount: usd(200) },
      ],
    });

    // Bill-linked expense: $50 utility on 2026-03-20.
    const [bill] = await (
      await import("../db/index.js")
    ).db
      .insert((await import("../db/index.js")).schema.bills)
      .values({
        workspaceId,
        name: "Electric",
        type: "utility",
        frequency: "monthly",
        currency: "USD",
      })
      .returning({ id: (await import("../db/index.js")).schema.bills.id });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-20",
      type: "expense",
      billId: bill!.id,
      legs: [{ accountId: checking, amount: -usd(50) }],
      lines: [{ categoryId: utilities, amount: usd(50) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outTop",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets.length, 1, "single monthly bucket");
    const bucket = res.buckets[0]!;
    assert.equal(bucket.expense, 30, "expense bucket is the plain grocery");
    assert.equal(bucket.loan, 200, "loan bucket is the transfer-to-loan");
    assert.equal(bucket.bill, 50, "bill bucket is the utility charge");
  });

  it("excludes expenses originating from a loan account (BNPL purchases)", async () => {
    // A loan-financed purchase (e.g., $400 couch on Affirm) lands as
    // an `expense` whose single leg is on the loan account. Cash
    // flow shouldn't show it — no cash has left the user yet. The
    // by-category chart still counts it (different handler); this
    // exclusion is specifically for the cash-flow view.
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const bnpl = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Affirm",
      type: "loan",
    });
    const shopping = await seedCategory(workspaceId, "Shopping", "expense");

    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-08",
      type: "expense",
      legs: [{ accountId: bnpl, amount: -usd(400) }],
      lines: [{ categoryId: shopping, amount: usd(400) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outTop",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets.length, 0, "loan-account expense filtered out");
  });

  it("excludes income, adjustments, and CASA↔CASA transfers", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const savings = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Savings",
      type: "checking_savings",
    });
    const salaryCat = await seedCategory(workspaceId, "Salary", "income");

    // Income — shouldn't appear in `out` buckets.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-01",
      type: "income",
      legs: [{ accountId: checking, amount: usd(5000) }],
      lines: [{ categoryId: salaryCat, amount: usd(5000) }],
    });

    // Adjustment — shouldn't appear (excludeAdjustments filter).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "adjustment",
      legs: [{ accountId: checking, amount: usd(100) }],
    });

    // CASA↔CASA transfer — shouldn't appear (positive leg, no bucket).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-12",
      type: "transfer",
      legs: [
        { accountId: checking, amount: -usd(800) },
        { accountId: savings, amount: usd(800) },
      ],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outTop",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets.length, 0, "nothing to report");
  });
});

describe("runCashFlow — outExpenses by category", () => {
  beforeEach(truncateAll);

  it("aggregates expense lines per category", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");
    const dining = await seedCategory(workspaceId, "Dining", "expense");

    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-08",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(80) }],
      lines: [{ categoryId: groceries, amount: usd(80) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-20",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(45) }],
      lines: [{ categoryId: dining, amount: usd(45) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outExpenses",
        ...WINDOW,
      },
      workspaceId,
    );

    const bucket = res.buckets[0]!;
    assert.equal(bucket[groceries], 80);
    assert.equal(bucket[dining], 45);
    // Two distinct series in the response items.
    assert.equal(res.items.length, 2);
  });

  it("excludes loan-account expenses (financed purchases wait for cash)", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const bnpl = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Affirm",
      type: "loan",
    });
    const shopping = await seedCategory(workspaceId, "Shopping", "expense");

    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-08",
      type: "expense",
      legs: [{ accountId: bnpl, amount: -usd(400) }],
      lines: [{ categoryId: shopping, amount: usd(400) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outExpenses",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets.length, 0);
  });

  it("excludes bill-linked expenses (they belong to the bill bucket)", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const utilities = await seedCategory(workspaceId, "Utilities", "expense");
    const { db, schema } = await import("../db/index.js");
    const [bill] = await db
      .insert(schema.bills)
      .values({
        workspaceId,
        name: "Electric",
        type: "utility",
        frequency: "monthly",
        currency: "USD",
      })
      .returning({ id: schema.bills.id });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "expense",
      billId: bill!.id,
      legs: [{ accountId: checking, amount: -usd(120) }],
      lines: [{ categoryId: utilities, amount: usd(120) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outExpenses",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets.length, 0, "bill-linked expense filtered out");
  });
});

describe("runCashFlow — inTop / income", () => {
  beforeEach(truncateAll);

  it("groups income lines by category", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const salary = await seedCategory(workspaceId, "Salary", "income");
    const freelance = await seedCategory(workspaceId, "Freelance", "income");

    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-01",
      type: "income",
      legs: [{ accountId: checking, amount: usd(6500) }],
      lines: [{ categoryId: salary, amount: usd(6500) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-22",
      type: "income",
      legs: [{ accountId: checking, amount: usd(500) }],
      lines: [{ categoryId: freelance, amount: usd(500) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "inTop",
        ...WINDOW,
      },
      workspaceId,
    );

    const bucket = res.buckets[0]!;
    assert.equal(bucket[salary], 6500);
    assert.equal(bucket[freelance], 500);
  });
});

describe("runCashFlow — net (in / out / net per period)", () => {
  beforeEach(truncateAll);

  it("sums signed legs; net = in + out", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const salary = await seedCategory(workspaceId, "Salary", "income");
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-01",
      type: "income",
      legs: [{ accountId: checking, amount: usd(6500) }],
      lines: [{ categoryId: salary, amount: usd(6500) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(120) }],
      lines: [{ categoryId: groceries, amount: usd(120) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "net",
        ...WINDOW,
      },
      workspaceId,
    );

    const bucket = res.buckets[0]!;
    assert.equal(bucket.in, 6500);
    assert.equal(bucket.out, -120);
    assert.equal(bucket.net, 6380);
  });
});

describe("runCashFlow — refund handling (effective date + signed-negative)", () => {
  beforeEach(truncateAll);

  it("partially nets a same-period refund out of the expense category — $50 − $30 = $20", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

    const originalId = await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(50) }],
      lines: [{ categoryId: groceries, amount: usd(50) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-25",
      type: "refund",
      refundedTransactionId: originalId,
      legs: [{ accountId: checking, amount: usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outExpenses",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets[0]![groceries], 20);
  });

  it("fully nets a same-period refund out — $30 − $30 = $0", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

    const originalId = await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-25",
      type: "refund",
      refundedTransactionId: originalId,
      legs: [{ accountId: checking, amount: usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outExpenses",
        ...WINDOW,
      },
      workspaceId,
    );

    // Category may be absent (zero-row short-circuit) or present
    // at 0 — both are valid per the shape contract.
    const bucket = res.buckets[0];
    if (bucket) {
      assert.equal(bucket[groceries] ?? 0, 0);
    }
  });

  it("attributes a later partial refund back to the original tx's period — March $50 − May $30 → March $20, May $0", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

    const originalId = await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(50) }],
      lines: [{ categoryId: groceries, amount: usd(50) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-05-10",
      type: "refund",
      refundedTransactionId: originalId,
      legs: [{ accountId: checking, amount: usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });

    // March: refund attributes here via effective-date, leaving $20 net.
    const march = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outExpenses",
        start: "2026-03-01",
        end: "2026-03-31",
      },
      workspaceId,
    );
    assert.equal(march.buckets[0]![groceries], 20);

    // May: no Groceries activity — the refund didn't post here for
    // analytics purposes.
    const may = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outExpenses",
        start: "2026-05-01",
        end: "2026-05-31",
      },
      workspaceId,
    );
    assert.equal(may.buckets.length, 0);
  });

  it("never surfaces refunds in the income (inTop) direction", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

    const originalId = await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-25",
      type: "refund",
      refundedTransactionId: originalId,
      legs: [{ accountId: checking, amount: usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "inTop",
        ...WINDOW,
      },
      workspaceId,
    );

    // Refunds aren't income; the inTop filter is `tx.type = 'income'`.
    assert.equal(res.buckets.length, 0);
  });
});

describe("runCashFlow — drill into one expense category (outExpensesByCategory)", () => {
  beforeEach(truncateAll);

  it("returns subcategory series within the picked category", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");
    const produce = await seedSubcategory(groceries, "Produce");
    const meat = await seedSubcategory(groceries, "Meat");

    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(20) }],
      lines: [
        { categoryId: groceries, subcategoryId: produce, amount: usd(20) },
      ],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-18",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(35) }],
      lines: [{ categoryId: groceries, subcategoryId: meat, amount: usd(35) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outExpensesByCategory",
        categoryId: groceries,
        ...WINDOW,
      },
      workspaceId,
    );

    const bucket = res.buckets[0]!;
    assert.equal(bucket[produce], 20);
    assert.equal(bucket[meat], 35);
  });
});
