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
  seedBill,
  seedCategory,
  seedSubcategory,
  seedTransaction,
  seedWorkspaceAndUser,
  truncateAll,
  usd,
} from "../test/helpers.js";
import { runCashFlow } from "./analytics.js";

// March + April. Aggregation tests seed in both months (2 in March,
// 1 in April is the common pattern) so a regression in either bucket
// or in cross-period grouping surfaces.
const WINDOW = { start: "2026-03-01", end: "2026-04-30" } as const;

describe("runCashFlow — outTop (3-bucket monthly)", () => {
  beforeEach(truncateAll);

  it("sums expenses, loan payments, and bill charges into separate buckets, per period", async () => {
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

    // March: 2 plain expenses ($30 + $20 = $50), 1 loan payment ($200),
    // 1 bill charge ($50).
    await seedTransaction({
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
      date: "2026-03-22",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(20) }],
      lines: [{ categoryId: groceries, amount: usd(20) }],
    });
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
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-20",
      type: "expense",
      billId: bill!.id,
      legs: [{ accountId: checking, amount: -usd(50) }],
      lines: [{ categoryId: utilities, amount: usd(50) }],
    });

    // April: 1 plain expense ($15) only.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-08",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(15) }],
      lines: [{ categoryId: groceries, amount: usd(15) }],
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

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march.expense, 50, "March expense = 30 + 20");
    assert.equal(march.loan, 200, "March loan = single payment");
    assert.equal(march.bill, 50, "March bill = utility charge");
    assert.equal(april.expense, 15, "April expense = 15");
    assert.equal(april.loan, undefined, "April had no loan activity");
    assert.equal(april.bill, undefined, "April had no bill activity");
  });

  it("returns buckets in chronological order when periods interleave across buckets", async () => {
    // Regression: an early version of the line-aware refactor ran three
    // subqueries (bill/expense/loan) in parallel and concatenated. When
    // a period existed only in one subquery's output, it was appended
    // out of chronological order by `shapeResponse`'s Map insertion.
    // E.g., expense-only on day 1 + day 3, loan-only on day 2, produced
    // [day 1, day 3, day 2] instead of [day 1, day 2, day 3].
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const mortgage = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Mortgage",
      type: "loan",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

    // Day 1: expense.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });
    // Day 2: loan payment (no line items).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "transfer",
      legs: [
        { accountId: checking, amount: -usd(500) },
        { accountId: mortgage, amount: usd(500) },
      ],
    });
    // Day 3: another expense.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(20) }],
      lines: [{ categoryId: groceries, amount: usd(20) }],
    });

    const res = await runCashFlow(
      {
        granularity: "daily",
        currency: "USD",
        dimension: "outTop",
        start: "2026-03-01",
        end: "2026-03-31",
      },
      workspaceId,
    );

    assert.deepEqual(
      res.buckets.map((b) => b.period),
      ["2026-03-05", "2026-03-10", "2026-03-15"],
      "buckets must be chronological even when periods skip a bucket",
    );
  });

  it("splits loan payments: interest line → expense, principal → loan", async () => {
    // Loan payment with an interest line: $1500 cash out, $10 categorized
    // as interest. Loan bucket should report the $1490 principal; the $10
    // shifts to the expense bucket so cash-flow agrees with the by-cat
    // chart (which counts interest as an expense line).
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const mortgage = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Mortgage",
      type: "loan",
    });
    const interest = await seedCategory(workspaceId, "Interest", "expense");

    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "transfer",
      legs: [
        { accountId: checking, amount: -usd(1500) },
        { accountId: mortgage, amount: usd(1500) },
      ],
      lines: [{ categoryId: interest, amount: usd(10) }],
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

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    assert.equal(
      march.loan,
      1490,
      "principal = $1500 cash out − $10 interest line",
    );
    assert.equal(march.expense, 10, "interest line lands in expense bucket");
    assert.equal(march.bill, undefined);
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

  it("aggregates expense lines per category, summed per period", async () => {
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

    // March: 1 Groceries $80, 1 Dining $45.
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
    // April: 1 Groceries $20.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-12",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(20) }],
      lines: [{ categoryId: groceries, amount: usd(20) }],
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

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march[groceries], 80);
    assert.equal(march[dining], 45);
    assert.equal(april[groceries], 20);
    assert.equal(april[dining], undefined, "no dining in April");
    // Two distinct series across the whole response.
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

  it("INCLUDES interest lines on loan-payment transfers (matches outTop)", async () => {
    // Loan payment with a $10 interest line. The interest line should
    // surface under its expense category when drilling into Expense —
    // same as `outTop`'s expense bucket and the by-category chart.
    // Regression for an early version of the line-aware `outTop` that
    // only updated the top-level handler.
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const mortgage = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Mortgage",
      type: "loan",
    });
    const interest = await seedCategory(workspaceId, "Interest", "expense");

    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "transfer",
      legs: [
        { accountId: checking, amount: -usd(1500) },
        { accountId: mortgage, amount: usd(1500) },
      ],
      lines: [{ categoryId: interest, amount: usd(10) }],
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

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    assert.equal(march[interest], 10, "interest line under Interest category");
  });
});

describe("runCashFlow — inTop / income", () => {
  beforeEach(truncateAll);

  it("groups income lines by category, summed per period", async () => {
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

    // March: salary + freelance.
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
    // April: salary only.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-01",
      type: "income",
      legs: [{ accountId: checking, amount: usd(6700) }],
      lines: [{ categoryId: salary, amount: usd(6700) }],
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

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march[salary], 6500);
    assert.equal(march[freelance], 500);
    assert.equal(april[salary], 6700);
    assert.equal(april[freelance], undefined);
  });
});

describe("runCashFlow — net (in / out / net per period)", () => {
  beforeEach(truncateAll);

  it("sums signed legs; net = in + out, per period", async () => {
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

    // March: salary $6500 in, 2 expenses ($120 + $80 = $200 out).
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
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-25",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(80) }],
      lines: [{ categoryId: groceries, amount: usd(80) }],
    });
    // April: salary $6700 in only.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-01",
      type: "income",
      legs: [{ accountId: checking, amount: usd(6700) }],
      lines: [{ categoryId: salary, amount: usd(6700) }],
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

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march.in, 6500);
    assert.equal(march.out, -200);
    assert.equal(march.net, 6300);
    assert.equal(april.in, 6700);
    assert.equal(april.out, 0);
    assert.equal(april.net, 6700);
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

  it("returns subcategory series within the picked category, summed per period", async () => {
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

    // March: 1 Produce + 1 Meat.
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
    // April: 1 Produce only.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(15) }],
      lines: [
        { categoryId: groceries, subcategoryId: produce, amount: usd(15) },
      ],
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

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march[produce], 20);
    assert.equal(march[meat], 35);
    assert.equal(april[produce], 15);
    assert.equal(april[meat], undefined);
  });
});

describe("runCashFlow — outBills / outBillsByType refund handling", () => {
  beforeEach(truncateAll);

  it("nets a refund of a bill charge back out of the bill's type bucket", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const utilities = await seedCategory(workspaceId, "Utilities", "expense");
    const billId = await seedBill({
      workspaceId,
      name: "Electric",
      type: "utility",
    });

    const originalId = await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      billId,
      legs: [{ accountId: checking, amount: -usd(50) }],
      lines: [{ categoryId: utilities, amount: usd(50) }],
    });
    // Refund tx has `bill_id = NULL` — the bill linkage flows through
    // `refundedTransactionId → original_tx.bill_id`. Pre-fix, the
    // refund was silently dropped from outBills because the inner
    // join keyed on `tx.bill_id` alone.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-20",
      type: "refund",
      refundedTransactionId: originalId,
      legs: [{ accountId: checking, amount: usd(30) }],
      lines: [{ categoryId: utilities, amount: usd(30) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outBills",
        ...WINDOW,
      },
      workspaceId,
    );

    // utility bucket = 50 charge − 30 refund = 20
    assert.equal(res.buckets[0]!["utility"], 20);
  });

  it("nets the same refund out of the per-bill drill (outBillsByType)", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const entertainment = await seedCategory(
      workspaceId,
      "Entertainment",
      "expense",
    );
    const billId = await seedBill({
      workspaceId,
      name: "Netflix",
      type: "subscription",
    });

    const originalId = await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      billId,
      legs: [{ accountId: checking, amount: -usd(15) }],
      lines: [{ categoryId: entertainment, amount: usd(15) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-20",
      type: "refund",
      refundedTransactionId: originalId,
      legs: [{ accountId: checking, amount: usd(15) }],
      lines: [{ categoryId: entertainment, amount: usd(15) }],
    });

    const res = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outBillsByType",
        billType: "subscription",
        ...WINDOW,
      },
      workspaceId,
    );

    // Full netting: bucket may be absent (zero-row short-circuit) or
    // present at 0 — both valid per the shape contract.
    const bucket = res.buckets[0];
    if (bucket) {
      assert.equal(bucket[billId] ?? 0, 0);
    }
  });

  it("attributes a cross-period bill refund back to the original tx's bucket", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const utilities = await seedCategory(workspaceId, "Utilities", "expense");
    const billId = await seedBill({
      workspaceId,
      name: "Water",
      type: "utility",
    });

    // March $50 charge, May $30 refund.
    const originalId = await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "expense",
      billId,
      legs: [{ accountId: checking, amount: -usd(50) }],
      lines: [{ categoryId: utilities, amount: usd(50) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-05-10",
      type: "refund",
      refundedTransactionId: originalId,
      legs: [{ accountId: checking, amount: usd(30) }],
      lines: [{ categoryId: utilities, amount: usd(30) }],
    });

    // March: refund attributes here via effective-date, leaving $20.
    const march = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outBills",
        start: "2026-03-01",
        end: "2026-03-31",
      },
      workspaceId,
    );
    assert.equal(march.buckets[0]!["utility"], 20);

    // May: no bill activity — the refund bucketed back into March.
    const may = await runCashFlow(
      {
        granularity: "monthly",
        currency: "USD",
        dimension: "outBills",
        start: "2026-05-01",
        end: "2026-05-31",
      },
      workspaceId,
    );
    assert.equal(may.buckets.length, 0);
  });
});
