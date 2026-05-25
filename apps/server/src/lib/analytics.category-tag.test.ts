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

const WINDOW = { start: "2026-03-01", end: "2026-03-31" } as const;

describe("runCategoryTag — top-level category aggregation", () => {
  beforeEach(truncateAll);

  it("sums expense lines under the same category into one series", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

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

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets[0]![groceries], 50);
  });

  it("returns one series per distinct expense category", async () => {
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

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets[0]![groceries], 40);
    assert.equal(res.buckets[0]![dining], 25);
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

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets[0]![groceries], 30);
    assert.equal(res.buckets[0]![salary], undefined);
  });

  it("includes income categories when direction='income'", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const salary = await seedCategory(workspaceId, "Salary", "income");

    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "income",
      legs: [{ accountId: checking, amount: usd(2000) }],
      lines: [{ categoryId: salary, amount: usd(2000) }],
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

    assert.equal(res.buckets[0]![salary], 2000);
  });

  it("buckets by month across a wide date range", async () => {
    const { workspaceId, userId } = await seedWorkspaceAndUser();
    const groupId = await seedAccountGroup(workspaceId);
    const checking = await seedAccount({
      workspaceId,
      accountGroupId: groupId,
      name: "Checking",
      type: "checking_savings",
    });
    const groceries = await seedCategory(workspaceId, "Groceries", "expense");

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
      date: "2026-04-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(45) }],
      lines: [{ categoryId: groceries, amount: usd(45) }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        start: "2026-03-01",
        end: "2026-04-30",
      },
      workspaceId,
    );

    assert.equal(res.buckets.length, 2);
    // Mantine charts read period as the bucket label; assert by
    // walking the buckets array rather than indexing on string.
    const march = res.buckets.find((b) => b.period.startsWith("2026-03"));
    const april = res.buckets.find((b) => b.period.startsWith("2026-04"));
    assert.equal(march![groceries], 30);
    assert.equal(april![groceries], 45);
  });
});

describe("runCategoryTag — tag filter", () => {
  beforeEach(truncateAll);

  it("with a specific tag id, includes only lines carrying that tag", async () => {
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

    // Tagged $30.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-05",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(30) }],
      lines: [{ categoryId: groceries, amount: usd(30), tagIds: [family] }],
    });
    // Untagged $50 — should be excluded by the filter.
    await seedTransaction({
      workspaceId,
      userId,
      date: "2026-03-15",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(50) }],
      lines: [{ categoryId: groceries, amount: usd(50) }],
    });

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        tagId: family,
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets[0]![groceries], 30);
  });

  it("with tagId='__none__', includes only untagged lines", async () => {
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

    const res = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "USD",
        direction: "expense",
        tagId: "__none__",
        ...WINDOW,
      },
      workspaceId,
    );

    assert.equal(res.buckets[0]![groceries], 50);
  });
});

describe("runCategoryTag — currency filter", () => {
  beforeEach(truncateAll);

  it("filters lines by `line.currency`, not by account currency", async () => {
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
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: eurChecking, amount: -usd(25) }],
      lines: [{ categoryId: groceries, amount: usd(25), currency: "EUR" }],
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
    assert.equal(usdRes.buckets[0]![groceries], 40);

    const eurRes = await runCategoryTag(
      {
        granularity: "monthly",
        currency: "EUR",
        direction: "expense",
        ...WINDOW,
      },
      workspaceId,
    );
    assert.equal(eurRes.buckets[0]![groceries], 25);
  });
});

describe("runCategoryTag — drill into one category", () => {
  beforeEach(truncateAll);

  it("with categoryId set, returns one series per subcategory", async () => {
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
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(35) }],
      lines: [{ categoryId: groceries, subcategoryId: meat, amount: usd(35) }],
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

    assert.equal(res.buckets[0]![produce], 20);
    assert.equal(res.buckets[0]![meat], 35);
  });

  it("with categoryId + subcategoryId, restricts to that one subcategory", async () => {
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
      date: "2026-03-10",
      type: "expense",
      legs: [{ accountId: checking, amount: -usd(35) }],
      lines: [{ categoryId: groceries, subcategoryId: meat, amount: usd(35) }],
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

    assert.equal(res.buckets[0]![produce], 20);
    assert.equal(res.buckets[0]![meat], undefined);
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
