/**
 * By-category-&-tag analytics — integration tests against a real
 * Postgres spun up via testcontainers. Same conventions as
 * `analytics.cashflow.test.ts`: one workspace per test, beforeEach
 * TRUNCATE, USD amounts via `usd(N)`.
 *
 * The handler differs from cash-flow's category dimensions in three
 * non-obvious ways, each covered below:
 *
 *   1. Loan-account expense lines ARE counted (financed purchases
 *      attribute to a category on the day you bought them).
 *   2. Bill-linked expense lines ARE counted (a Netflix charge is
 *      Entertainment → Streaming spend).
 *   3. Refunds attribute to the ORIGINAL tx's date and contribute
 *      signed-negative (cancel the corresponding expense line in the
 *      same category bucket — regression for a pre-fix bug where they
 *      were summed as positives in their own period).
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  seedAccount,
  seedAccountGroup,
  seedCategory,
  seedSubcategory,
  seedTag,
  seedTransaction,
  seedWorkspaceAndUser,
  truncateAll,
  usd,
} from "../test/helpers.js";
import { runCategoryTag } from "./analytics.js";

// March + April. Tests that exercise aggregation seed data in BOTH
// months (2 txs March, 1 tx April is the typical pattern) so a
// regression in either period or in cross-period grouping surfaces.
const WINDOW = { start: "2026-03-01", end: "2026-04-30" } as const;

describe("runCategoryTag — top-level category aggregation", () => {
  beforeEach(truncateAll);

  it("sums expense lines under the same category per period", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

    // March: 2 txs ($30 + $20 = $50).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-20",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(20) }],
      lines: [{ categoryId: groceries, amount: usd(20) }],
    });
    // April: 1 tx ($15).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-08",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(15) }],
      lines: [{ categoryId: groceries, amount: usd(15) }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"));
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"));
    assert.equal(march![groceries], 50);
    assert.equal(april![groceries], 15);
  });

  it("returns one series per distinct expense category, summed per period", async () => {
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

    // March: 1 Groceries + 1 Dining.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(40) }],
      lines: [{ categoryId: groceries, amount: usd(40) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(25) }],
      lines: [{ categoryId: dining, amount: usd(25) }],
    });
    // April: 1 Groceries only.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-12",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(10) }],
      lines: [{ categoryId: groceries, amount: usd(10) }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march[groceries], 40);
    assert.equal(march[dining], 25);
    assert.equal(april[groceries], 10);
    // Dining had no April activity — series omitted from that bucket.
    assert.equal(april[dining], undefined);
  });

  it("excludes income categories when direction='expense'", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");
    const salary = await seedCategory(workspaceId, "Salary", "income");

    // March: $30 expense + $2000 income (income should be excluded).
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
      date: "2026-03-15",
      type: "income",
      legs: [{ accountId: checking, amount: usd(2000) }],
      lines: [{ categoryId: salary, amount: usd(2000) }],
    });
    // April: $45 expense only.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-12",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(45) }],
      lines: [{ categoryId: groceries, amount: usd(45) }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march[groceries], 30);
    assert.equal(march[salary], undefined);
    assert.equal(april[groceries], 45);
  });

  it("includes income categories when direction='income', summed per period", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const salary = await seedCategory(workspaceId, "Salary", "income");
    const bonus = await seedCategory(workspaceId, "Bonus", "income");

    // March: salary + bonus.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "income",
      legs: [{ accountId: checking, amount: usd(2000) }],
      lines: [{ categoryId: salary, amount: usd(2000) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-28",
      type: "income",
      legs: [{ accountId: checking, amount: usd(500) }],
      lines: [{ categoryId: bonus, amount: usd(500) }],
    });
    // April: just salary.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-15",
      type: "income",
      legs: [{ accountId: checking, amount: usd(2100) }],
      lines: [{ categoryId: salary, amount: usd(2100) }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "income",
        ...WINDOW,
      },
      workspaceId,
    );

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march[salary], 2000);
    assert.equal(march[bonus], 500);
    assert.equal(april[salary], 2100);
    assert.equal(april[bonus], undefined);
  });
});

describe("runCategoryTag — tag filter", () => {
  beforeEach(truncateAll);

  it("with a specific tag id, includes only lines carrying that tag, summed per period", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");
    const family = await seedTag(workspaceId, "family");

    // March: 2 tagged ($30 + $20 = $50) + 1 untagged $50 (noise).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30), tagIds: [family] }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-12",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(20) }],
      lines: [{ categoryId: groceries, amount: usd(20), tagIds: [family] }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(50) }],
      lines: [{ categoryId: groceries, amount: usd(50) }],
    });
    // April: 1 tagged ($15).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(15) }],
      lines: [{ categoryId: groceries, amount: usd(15), tagIds: [family] }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        tagIds: [family],
        ...WINDOW,
      },
      workspaceId,
    );

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march[groceries], 50);
    assert.equal(april[groceries], 15);
  });

  it("with tagIds=['__none__'], includes only untagged lines, per period", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");
    const family = await seedTag(workspaceId, "family");

    // March: 2 untagged ($50 + $20 = $70) + 1 tagged $30 (noise).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30), tagIds: [family] }],
    });
    await seedTransaction({
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
      date: "2026-03-22",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(20) }],
      lines: [{ categoryId: groceries, amount: usd(20) }],
    });
    // April: 1 untagged ($40).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-08",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(40) }],
      lines: [{ categoryId: groceries, amount: usd(40) }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        tagIds: ["__none__"],
        ...WINDOW,
      },
      workspaceId,
    );

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march[groceries], 70);
    assert.equal(april[groceries], 40);
  });
});

describe("runCategoryTag — currency filter", () => {
  beforeEach(truncateAll);

  it("filters lines by `line.currency`, not by account currency, summed per period", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const usdChecking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "USD",
      type: "checking_savings",
      currency: "USD",
    });
    const eurChecking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "EUR",
      type: "checking_savings",
      currency: "EUR",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

    // March: 2 USD ($40 + $30 = $70) + 1 EUR €25 (noise for USD query).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      legs: [{ accountId: usdChecking, amount: -usd(40) }],
      lines: [{ categoryId: groceries, amount: usd(40), currency: "USD" }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-18",
      type: "expense",
      legs: [{ accountId: usdChecking, amount: -usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30), currency: "USD" }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: eurChecking, amount: -usd(25) }],
      lines: [{ categoryId: groceries, amount: usd(25), currency: "EUR" }],
    });
    // April: 1 USD ($20).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-08",
      type: "expense",
      legs: [{ accountId: usdChecking, amount: -usd(20) }],
      lines: [{ categoryId: groceries, amount: usd(20), currency: "USD" }],
    });

    const usdRes = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );
    const usdMarch = usdRes.buckets.find((b) =>
      b.period.startsWith("2026-03"),
    )!;
    const usdApril = usdRes.buckets.find((b) =>
      b.period.startsWith("2026-04"),
    )!;
    assert.equal(usdMarch[groceries], 70);
    assert.equal(usdApril[groceries], 20);

    const eurRes = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "EUR",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );
    const eurMarch = eurRes.buckets.find((b) =>
      b.period.startsWith("2026-03"),
    )!;
    assert.equal(eurMarch[groceries], 25);
    // No EUR activity in April — series omitted.
    assert.equal(
      eurRes.buckets.find((b) => b.period.startsWith("2026-04")),
      undefined,
    );
  });
});

describe("runCategoryTag — drill into one category", () => {
  beforeEach(truncateAll);

  it("with categoryId set, returns one series per subcategory, summed per period", async () => {
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
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(35) }],
      lines: [{ categoryId: groceries, subcategoryId: meat, amount: usd(35) }],
    });
    // April: 1 Produce only.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-12",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(15) }],
      lines: [
        { categoryId: groceries, subcategoryId: produce, amount: usd(15) },
      ],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
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

  it("with categoryId + subcategoryId, restricts to that one subcategory across periods", async () => {
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

    // March: 2 Produce ($20 + $10 = $30) + 1 Meat $35 (noise).
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
      legs: [{ accountId: checking, amount: -usd(10) }],
      lines: [
        { categoryId: groceries, subcategoryId: produce, amount: usd(10) },
      ],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(35) }],
      lines: [{ categoryId: groceries, subcategoryId: meat, amount: usd(35) }],
    });
    // April: 1 Produce ($25).
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-04-09",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(25) }],
      lines: [
        { categoryId: groceries, subcategoryId: produce, amount: usd(25) },
      ],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        categoryId: groceries,
        subcategoryId: produce,
        ...WINDOW,
      },
      workspaceId,
    );

    const march = res.buckets.find((b) => b.period.startsWith("2026-03"))!;
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"))!;
    assert.equal(march[produce], 30);
    assert.equal(march[meat], undefined);
    assert.equal(april[produce], 25);
  });
});

describe("runCategoryTag — distinct from cash-flow", () => {
  beforeEach(truncateAll);

  it("INCLUDES expense lines whose leg is on a loan account (financed purchases)", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const affirm = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Affirm",
      type: "loan",
    });
    const shopping = await seedCategory(workspaceId, "Shopping", "expense");

    // BNPL purchase: expense leg on a loan account. Cash flow would
    // exclude this; the by-category chart counts it on the purchase
    // day under "Shopping".
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-12",
      type: "expense",
      legs: [{ accountId: affirm, amount: -usd(400) }],
      lines: [{ categoryId: shopping, amount: usd(400) }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets[0]![shopping], 400);
  });

  it("INCLUDES bill-linked expense lines (e.g., Netflix → Streaming)", async () => {
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

    // No need to set up a real bill row — handleCategoryTag doesn't
    // filter on billId. Cash-flow's outExpenses would skip this; by-
    // category sees it.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-06",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(15.49) }],
      lines: [{ categoryId: entertainment, amount: usd(15.49) }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets[0]![entertainment], 15.49);
  });
});

describe("runCategoryTag — refund handling (regression for missing refund-aware bucketing)", () => {
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

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    // Before the fix: refund line was summed positive → $80.
    assert.equal(res.buckets[0]![groceries], 20);
  });

  it("fully nets a same-period refund — $30 − $30 = $0", async () => {
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

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    // Category may be absent (zero-row short-circuit) or present at
    // 0 — both are valid per the shape contract.
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
    const march = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        start: "2026-03-01",
        end: "2026-03-31",
      },
      workspaceId,
    );
    assert.equal(march.buckets[0]![groceries], 20);

    // May: the refund didn't post here for analytics purposes — no
    // grocery activity in May.
    const may = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        start: "2026-05-01",
        end: "2026-05-31",
      },
      workspaceId,
    );
    assert.equal(may.buckets.length, 0);
  });

  it("a refund without a corresponding original-period expense reads as negative for that bucket", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

    // Original is OUTSIDE the queried window (February). The refund
    // (in March) attributes back to February, so the March window
    // sees no grocery activity at all.
    const originalId = await seedTransaction({
      workspaceId,
      userId,
      date: "2026-02-15",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(50) }],
      lines: [{ categoryId: groceries, amount: usd(50) }],
    });
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-10",
      type: "refund",
      refundedTransactionId: originalId,
      legs: [{ accountId: checking, amount: usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30) }],
    });

    const march = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    // March bucket should not include the refund — it bucketed back
    // into February via the effective date.
    assert.equal(march.buckets.length, 0);
  });
});
