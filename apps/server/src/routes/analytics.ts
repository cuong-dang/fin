import {
  type AnalyticsChartResponse,
  cashFlowQuery,
  categorySpendingQuery,
  type ChartBucket,
  type ChartItem,
  type Granularity,
  netWorthQuery,
} from "@fin/schemas";
import {
  aliasedTable,
  and,
  eq,
  gte,
  lte,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { db, schema } from "../db";
import { findOwned } from "../lib/authz";

/**
 * Postgres `date_trunc` unit per granularity. Daily uses no truncation
 * (we just take the date column) and gets a trailing-30-day default
 * window from the client; the others bucket appropriately.
 *
 * `weekly` is a special case — `date_trunc('week', d)` always returns
 * Monday (ISO weeks). We want Sunday-starting weeks to match common
 * personal-finance convention, so the trunc expression below adds 1
 * day before truncating and subtracts 1 after to shift the boundary.
 */
const TRUNC_UNIT: Record<Granularity, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

/**
 * `to_char` format string per granularity. Picked to match the labels
 * the client displays directly (no extra formatting on the chart side).
 * Weekly drops the year and uses `Mon DD` (e.g., "Apr 26") for a
 * compact X axis — week-start convention is already signalled by the
 * "Weekly (Sun)" label on the granularity toggle.
 */
const PERIOD_FORMAT: Record<Granularity, string> = {
  daily: "YYYY-MM-DD",
  weekly: "Mon DD",
  monthly: "YYYY-MM",
  yearly: "YYYY",
};

/**
 * Truncate `col` to the start of its bucket for the given granularity.
 * For `weekly`, shifts by ±1 day around `date_trunc('week', …)` so the
 * bucket starts on Sunday instead of Postgres's default Monday.
 */
function truncExprFor(granularity: Granularity, col: SQL): SQL<unknown> {
  if (granularity === "weekly") {
    return sql`(date_trunc('week', ${col} + interval '1 day') - interval '1 day')`;
  }
  const unit = sql.raw(`'${TRUNC_UNIT[granularity]}'`);
  return sql`date_trunc(${unit}, ${col})`;
}

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  /**
   * "Cash flow" chart data. Three directions, eight dimensions:
   *
   * **out**
   *   - outTop: 3 synthetic stacks per period: Expenses, Loan payments,
   *     Bills. Mutually exclusive (CASE order: bill > loan-transfer > expense).
   *   - outExpenses: outTop's "Expenses" bucket broken down by category.
   *   - outExpensesByCategory: a single category broken down by subcategory.
   *   - outLoans: outTop's "Loan payments" bucket broken down by loan account.
   *   - outBills: outTop's "Bills" bucket broken down by bill (any type).
   *
   * **in**
   *   - inTop: income transactions grouped by income-kind category.
   *   - inByCategory: a single income category broken down by subcategory.
   *
   * **net**
   *   - net: per-period signed sum of leg amounts on CASA/CC accounts.
   *     Income legs (+) and outflow legs (−) net naturally; internal
   *     transfers (CASA↔CASA, CC payments) cancel because both legs land
   *     on CASA/CC. Loan-account legs are excluded — financed purchases
   *     don't move cash today; their cash impact surfaces later as loan
   *     payments via the `out` direction.
   *
   * Excluded from every dimension: adjustments. The `out` direction
   * additionally excludes CASA→CASA transfers, CC payments, and
   * loan-account expenses (handled by the bucket CASE).
   *
   * Sums use the negative leg for outTop / outLoans / outSubs (cash
   * leaving the source). Drill modes sum line amounts directly so the
   * per-category breakdown is correct for split-line transactions.
   */
  app.get("/cash-flow", async (req): Promise<AnalyticsChartResponse> => {
    const { granularity, start, end, currency, dimension, categoryId } =
      cashFlowQuery.parse(req.query);
    const fmtLit = sql.raw(`'${PERIOD_FORMAT[granularity]}'`);
    const truncExpr = truncExprFor(
      granularity,
      sql`${schema.transactions.date}`,
    );
    const periodExpr = sql<string>`to_char(${truncExpr}, ${fmtLit})`;
    const legAmountExpr = sql<string>`SUM(-${schema.transactionLegs.amount})::text`;
    const lineAmountExpr = sql<string>`SUM(${schema.transactionLines.amount})::text`;
    const signedLegAmountExpr = sql<string>`SUM(${schema.transactionLegs.amount})::text`;

    type Row = {
      period: string;
      itemId: string;
      itemName: string;
      amountMinor: string;
    };
    let rows: Row[];

    if (
      dimension === "outExpenses" ||
      dimension === "outExpensesByCategory" ||
      dimension === "inTop" ||
      dimension === "inByCategory"
    ) {
      // Per-category (or per-subcategory) breakdown of expense or income
      // transactions. Source filter is on the leg's account (CASA / CC);
      // category/subcategory filter and grouping are on the line. Each
      // expense / income transaction has exactly one leg, so joining
      // legs × lines doesn't change line totals.
      //
      // The expense path additionally excludes bill-tagged expenses
      // (those land in the Bills bucket of `outTop`); the income path
      // has no such filter — income with a bill link is still income.
      const isIncome = dimension === "inTop" || dimension === "inByCategory";
      const drilling =
        dimension === "outExpensesByCategory" || dimension === "inByCategory";
      const baseSelect = {
        period: periodExpr,
        itemId: drilling
          ? schema.transactionLines.subcategoryId
          : schema.categories.id,
        itemName: drilling ? schema.subcategories.name : schema.categories.name,
        amountMinor: lineAmountExpr,
      };
      const baseQuery = db
        .select(baseSelect)
        .from(schema.transactionLines)
        .innerJoin(
          schema.transactions,
          eq(schema.transactions.id, schema.transactionLines.transactionId),
        )
        .innerJoin(
          schema.transactionLegs,
          eq(
            schema.transactionLegs.transactionId,
            schema.transactionLines.transactionId,
          ),
        )
        .innerJoin(
          schema.accounts,
          eq(schema.accounts.id, schema.transactionLegs.accountId),
        );

      const baseWhere = isIncome
        ? and(
            eq(schema.transactions.groupId, req.auth.groupId),
            eq(schema.transactionLines.currency, currency),
            eq(schema.transactions.type, "income"),
            sql`${schema.accounts.type} IN ('checking_savings', 'credit_card')`,
            gte(schema.transactions.date, start),
            lte(schema.transactions.date, end),
          )
        : and(
            eq(schema.transactions.groupId, req.auth.groupId),
            eq(schema.transactionLines.currency, currency),
            eq(schema.transactions.type, "expense"),
            sql`${schema.transactions.billId} IS NULL`,
            sql`${schema.accounts.type} IN ('checking_savings', 'credit_card')`,
            gte(schema.transactions.date, start),
            lte(schema.transactions.date, end),
          );

      rows = drilling
        ? await baseQuery
            .leftJoin(
              schema.subcategories,
              eq(
                schema.subcategories.id,
                schema.transactionLines.subcategoryId,
              ),
            )
            .where(
              and(
                baseWhere,
                eq(schema.transactionLines.categoryId, categoryId!),
              ),
            )
            .groupBy(
              truncExpr,
              schema.transactionLines.subcategoryId,
              schema.subcategories.name,
            )
            .orderBy(truncExpr)
            // The drill itemId can be null (line with no subcategory).
            // Coerce to a string for Row's type contract; the client
            // turns it back into "Other" later.
            .then((rs) =>
              rs.map((r) => ({
                period: r.period,
                itemId: r.itemId ?? "",
                itemName: r.itemName ?? "Other",
                amountMinor: r.amountMinor,
              })),
            )
        : await baseQuery
            .innerJoin(
              schema.categories,
              eq(schema.categories.id, schema.transactionLines.categoryId),
            )
            .where(baseWhere)
            .groupBy(truncExpr, schema.categories.id, schema.categories.name)
            .orderBy(truncExpr)
            .then((rs) =>
              rs.map((r) => ({
                period: r.period,
                itemId: r.itemId ?? "",
                itemName: r.itemName ?? "",
                amountMinor: r.amountMinor,
              })),
            );
    } else if (dimension === "outLoans") {
      // Per-loan breakdown (transfers to loan accounts, any source).
      const destLeg = aliasedTable(schema.transactionLegs, "dest_leg");
      const destAcc = aliasedTable(schema.accounts, "dest_acc");
      rows = await db
        .select({
          period: periodExpr,
          itemId: destAcc.id,
          itemName: destAcc.name,
          amountMinor: legAmountExpr,
        })
        .from(schema.transactionLegs)
        .innerJoin(
          schema.transactions,
          eq(schema.transactions.id, schema.transactionLegs.transactionId),
        )
        .innerJoin(
          schema.accounts,
          eq(schema.accounts.id, schema.transactionLegs.accountId),
        )
        .innerJoin(
          destLeg,
          and(
            eq(destLeg.transactionId, schema.transactions.id),
            ne(destLeg.accountId, schema.transactionLegs.accountId),
          ),
        )
        .innerJoin(
          destAcc,
          and(eq(destAcc.id, destLeg.accountId), eq(destAcc.type, "loan")),
        )
        .where(
          and(
            eq(schema.transactions.groupId, req.auth.groupId),
            sql`${schema.transactionLegs.amount} < 0`,
            eq(schema.accounts.currency, currency),
            eq(schema.transactions.type, "transfer"),
            gte(schema.transactions.date, start),
            lte(schema.transactions.date, end),
          ),
        )
        .groupBy(truncExpr, destAcc.id, destAcc.name)
        .orderBy(truncExpr);
    } else if (dimension === "outBills") {
      // Per-bill breakdown (any bill type — utility, subscription, other).
      rows = await db
        .select({
          period: periodExpr,
          itemId: schema.bills.id,
          itemName: schema.bills.name,
          amountMinor: legAmountExpr,
        })
        .from(schema.transactionLegs)
        .innerJoin(
          schema.transactions,
          eq(schema.transactions.id, schema.transactionLegs.transactionId),
        )
        .innerJoin(
          schema.accounts,
          eq(schema.accounts.id, schema.transactionLegs.accountId),
        )
        .innerJoin(
          schema.bills,
          eq(schema.bills.id, schema.transactions.billId),
        )
        .where(
          and(
            eq(schema.transactions.groupId, req.auth.groupId),
            sql`${schema.transactionLegs.amount} < 0`,
            eq(schema.accounts.currency, currency),
            ne(schema.transactions.type, "adjustment"),
            gte(schema.transactions.date, start),
            lte(schema.transactions.date, end),
          ),
        )
        .groupBy(truncExpr, schema.bills.id, schema.bills.name)
        .orderBy(truncExpr);
    } else if (dimension === "net") {
      // Per-period signed sums on CASA/CC legs, split into two stacks:
      //   - "in"  — sum of positive legs (income)
      //   - "out" — sum of negative legs (outflows; value stays negative)
      // The client renders these as diverging bars (in above zero, out
      // below) plus a derived net line (in + out).
      //
      // Internal transfers (CASA↔CASA, CC payments) are excluded — they
      // would inflate both bars equally without changing net, and they
      // aren't "real" cash flow from the user's perspective. A transfer
      // with at least one leg on a loan account IS real cash flow (the
      // CASA leg surfaces as outflow); those are kept.
      const sideExpr = sql<string>`CASE WHEN ${schema.transactionLegs.amount} > 0 THEN 'in' ELSE 'out' END`;
      const sideNameExpr = sql<string>`CASE WHEN ${schema.transactionLegs.amount} > 0 THEN 'Cash in' ELSE 'Cash out' END`;
      const internalTransfer = sql`
        ${schema.transactions.type} = 'transfer'
        AND NOT EXISTS (
          SELECT 1 FROM transaction_legs ol
          INNER JOIN accounts oa ON oa.id = ol.account_id
          WHERE ol.transaction_id = ${schema.transactions.id}
            AND oa.type = 'loan'
        )
      `;
      rows = await db
        .select({
          period: periodExpr,
          itemId: sideExpr,
          itemName: sideNameExpr,
          amountMinor: signedLegAmountExpr,
        })
        .from(schema.transactionLegs)
        .innerJoin(
          schema.transactions,
          eq(schema.transactions.id, schema.transactionLegs.transactionId),
        )
        .innerJoin(
          schema.accounts,
          eq(schema.accounts.id, schema.transactionLegs.accountId),
        )
        .where(
          and(
            eq(schema.transactions.groupId, req.auth.groupId),
            eq(schema.accounts.currency, currency),
            sql`${schema.accounts.type} IN ('checking_savings', 'credit_card')`,
            ne(schema.transactions.type, "adjustment"),
            sql`NOT (${internalTransfer})`,
            gte(schema.transactions.date, start),
            lte(schema.transactions.date, end),
          ),
        )
        .groupBy(truncExpr, sideExpr, sideNameExpr)
        .orderBy(truncExpr);
    } else {
      // outTop: 3 synthetic buckets via CASE. Order matters — bill-tagged
      // expenses fall into "bill" rather than "expense" because the bill
      // branch comes first.
      const destTypeSubquery = sql<string>`(
        SELECT a.type FROM transaction_legs ol
        INNER JOIN accounts a ON a.id = ol.account_id
        WHERE ol.transaction_id = ${schema.transactions.id}
          AND ol.account_id <> ${schema.transactionLegs.accountId}
        LIMIT 1
      )`;
      const bucketIdExpr = sql<string>`CASE
        WHEN ${schema.transactions.billId} IS NOT NULL THEN 'bill'
        WHEN ${schema.transactions.type} = 'transfer' AND ${destTypeSubquery} = 'loan' THEN 'loan'
        WHEN ${schema.transactions.type} = 'expense' AND ${schema.accounts.type} IN ('checking_savings', 'credit_card') THEN 'expense'
      END`;
      rows = await db
        .select({
          period: periodExpr,
          itemId: bucketIdExpr,
          itemName: bucketIdExpr,
          amountMinor: legAmountExpr,
        })
        .from(schema.transactionLegs)
        .innerJoin(
          schema.transactions,
          eq(schema.transactions.id, schema.transactionLegs.transactionId),
        )
        .innerJoin(
          schema.accounts,
          eq(schema.accounts.id, schema.transactionLegs.accountId),
        )
        .where(
          and(
            eq(schema.transactions.groupId, req.auth.groupId),
            sql`${schema.transactionLegs.amount} < 0`,
            eq(schema.accounts.currency, currency),
            ne(schema.transactions.type, "adjustment"),
            gte(schema.transactions.date, start),
            lte(schema.transactions.date, end),
          ),
        )
        .groupBy(truncExpr, bucketIdExpr)
        // Drops rows that don't match any branch (CASA→CASA transfers,
        // CC payments, loan-account expenses).
        .having(sql`${bucketIdExpr} IS NOT NULL`)
        .orderBy(truncExpr);
    }

    const decimals = currencyDecimals(currency);
    const divisor = 10 ** decimals;

    const byPeriod = new Map<string, ChartBucket>();
    const itemsById = new Map<string, string>();
    for (const r of rows) {
      // Empty-string item id only happens in subcategory drills for
      // lines with no subcategory; key them under "__none__" so they
      // don't collide with anything else.
      const id = r.itemId || "__none__";
      itemsById.set(id, r.itemName);
      let bucket = byPeriod.get(r.period);
      if (!bucket) {
        bucket = { period: r.period };
        byPeriod.set(r.period, bucket);
      }
      bucket[id] = Number(r.amountMinor) / divisor;
    }

    let items: ChartItem[];
    if (dimension === "outTop") {
      // Stable display order; only include buckets that have data.
      const ORDER: { id: string; name: string }[] = [
        { id: "expense", name: "Expenses" },
        { id: "loan", name: "Loans" },
        { id: "bill", name: "Bills" },
      ];
      items = ORDER.filter((o) => itemsById.has(o.id));
    } else if (
      dimension === "outExpensesByCategory" ||
      dimension === "inByCategory"
    ) {
      // Subcategory drill — null subcategory becomes "Other" with id=null.
      items = [...itemsById.entries()]
        .map(([id, name]) =>
          id === "__none__" ? { id: null, name } : { id, name },
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      items = [...itemsById.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
      currency,
      items,
      buckets: [...byPeriod.values()],
    };
  });

  /**
   * By-category-&-tag chart data. Sums `transaction_lines.amount` by
   * truncated period, filtered to one currency. Adjustments have no
   * lines by design (see AGENTS.md) and are excluded structurally by
   * the line-driven join.
   *
   * Two modes:
   *   - default: GROUP BY category — stacks are top-level categories
   *     of the chosen `direction` (expense or income).
   *   - drill (`categoryId` set): GROUP BY subcategory, filtered to
   *     that category's lines. Lines with a null subcategory roll up
   *     under "Other" with id=null.
   *
   * Optional `tagId` filter: a UUID restricts to lines tagged with
   * that tag; the literal `"none"` restricts to untagged lines.
   *
   * Buckets use ids as keys (not names) so the client can robustly
   * track stacks even if names contain special chars.
   */
  app.get("/category-spending", async (req, reply) => {
    const { granularity, start, end, currency, direction, categoryId, tagId } =
      categorySpendingQuery.parse(req.query);

    // Drill mode: validate the category is owned and matches the
    // current `direction` up front. The drill query filters lines by
    // `categoryId` directly (no `categories` join), so without this
    // guard a hand-crafted URL could pass a wrong-kind category and
    // render mismatched lines.
    if (categoryId) {
      const cat = await findOwned(
        schema.categories,
        categoryId,
        req.auth.groupId,
      );
      if (!cat || cat.kind !== direction) {
        return reply
          .code(400)
          .send({ error: `Category must be ${direction}-kind` });
      }
    }

    // Specific-tag mode: validate the tag is owned. "none" sentinel
    // doesn't need lookup.
    if (tagId && tagId !== "none") {
      const tag = await findOwned(schema.tags, tagId, req.auth.groupId);
      if (!tag) return reply.code(400).send({ error: "Tag not found" });
    }

    // Inline the to_char format as a raw SQL literal — bind-parameter
    // form would prevent Postgres from seeing the SELECT and GROUP BY
    // expressions as the same expression (different placeholders);
    // enum-validated values are safe to splice raw.
    const fmtLit = sql.raw(`'${PERIOD_FORMAT[granularity]}'`);
    const truncExpr = truncExprFor(
      granularity,
      sql`${schema.transactions.date}`,
    );

    const drilling = !!categoryId;
    const periodExpr = sql<string>`to_char(${truncExpr}, ${fmtLit})`;
    const amountExpr = sql<string>`SUM(${schema.transactionLines.amount})::text`;

    // Tag filter expressed as a SQL fragment that joins the WHERE
    // clause. Specific-tag uses EXISTS rather than INNER JOIN to keep
    // the line-row count stable when a line carries multiple tags
    // (otherwise the SUM would multiply by the number of tags).
    const tagFilter =
      tagId === "none"
        ? sql`NOT EXISTS (
            SELECT 1 FROM transaction_line_tags lt
            WHERE lt.line_id = ${schema.transactionLines.id}
          )`
        : tagId
          ? sql`EXISTS (
              SELECT 1 FROM transaction_line_tags lt
              WHERE lt.line_id = ${schema.transactionLines.id}
                AND lt.tag_id = ${tagId}
            )`
          : undefined;

    // Shared scaffolding (FROM/JOIN/WHERE/select shape); the ternary
    // below only varies the lookup-table join, the discriminating
    // filter (categoryId vs. kind), and the groupBy targets.
    const baseSelect = {
      period: periodExpr,
      itemId: drilling
        ? schema.transactionLines.subcategoryId
        : schema.categories.id,
      itemName: drilling ? schema.subcategories.name : schema.categories.name,
      amountMinor: amountExpr,
    };
    const baseQuery = db
      .select(baseSelect)
      .from(schema.transactionLines)
      .innerJoin(
        schema.transactions,
        eq(schema.transactions.id, schema.transactionLines.transactionId),
      );
    const baseWhere = and(
      eq(schema.transactions.groupId, req.auth.groupId),
      eq(schema.transactionLines.currency, currency),
      gte(schema.transactions.date, start),
      lte(schema.transactions.date, end),
      tagFilter,
    );

    const rows = drilling
      ? await baseQuery
          .leftJoin(
            schema.subcategories,
            eq(schema.subcategories.id, schema.transactionLines.subcategoryId),
          )
          .where(
            and(baseWhere, eq(schema.transactionLines.categoryId, categoryId!)),
          )
          .groupBy(
            truncExpr,
            schema.transactionLines.subcategoryId,
            schema.subcategories.name,
          )
          .orderBy(truncExpr)
      : await baseQuery
          .innerJoin(
            schema.categories,
            eq(schema.categories.id, schema.transactionLines.categoryId),
          )
          .where(and(baseWhere, eq(schema.categories.kind, direction)))
          .groupBy(truncExpr, schema.categories.id, schema.categories.name)
          .orderBy(truncExpr);

    // Major units in the response so Recharts can chart directly.
    const decimals = currencyDecimals(currency);
    const divisor = 10 ** decimals;

    const byPeriod = new Map<string, ChartBucket>();
    // Map<id, name> — using a Map preserves insertion order and
    // dedupes. id is `null` for lines with no subcategory in drill
    // mode.
    const itemsById = new Map<string | null, string>();
    for (const r of rows) {
      const id = r.itemId;
      const name = r.itemName ?? "Other";
      itemsById.set(id, name);
      let bucket = byPeriod.get(r.period);
      if (!bucket) {
        bucket = { period: r.period };
        byPeriod.set(r.period, bucket);
      }
      // Use id as the key so names can be anything (including dots
      // or empty); the client maps id → label for display.
      const key = id ?? "__none__";
      bucket[key] = Number(r.amountMinor) / divisor;
    }

    const items: ChartItem[] = [...itemsById.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      currency,
      items,
      buckets: [...byPeriod.values()],
    };
  });

  /**
   * Net worth chart data. For each period in the window, returns the
   * cumulative balance (running sum of leg amounts up to and including
   * the end of that period), split into Assets (checking/savings) and
   * Liabilities (credit_card + loan). Liabilities surface as negative
   * values — Recharts' stacked area splits them below zero.
   *
   * Active accounts only. Excludes pending transactions (`date IS NULL`).
   * Adjustments are *included* (real balance changes). Same-currency
   * transfers / CC payments / loan payments naturally net to 0 because
   * both legs land on the user's accounts.
   *
   * The query: a CTE pipeline that (1) labels each leg with its bucket,
   * (2) generates every period in the window via `generate_series` so
   * gaps render as flat segments, (3) computes an anchor balance per
   * bucket from legs *before* the window, (4) sums per-period deltas,
   * and (5) emits the running cumulative via a window function on top
   * of the anchor.
   */
  app.get("/net-worth", async (req): Promise<AnalyticsChartResponse> => {
    const { granularity, start, end, currency } = netWorthQuery.parse(
      req.query,
    );
    const fmtLit = sql.raw(`'${PERIOD_FORMAT[granularity]}'`);
    const intervalLit = sql.raw(`'1 ${TRUNC_UNIT[granularity]}'::interval`);
    // Pre-build the trunc expression for each input we need to bucket.
    // For `weekly`, `truncExprFor` produces a Sunday-shifted form so
    // generated periods and per-day grouping land on Sundays.
    const truncStart = truncExprFor(granularity, sql`${start}::date`);
    const truncEnd = truncExprFor(granularity, sql`${end}::date`);
    const truncFirstLeg = truncExprFor(
      granularity,
      sql`(SELECT d FROM first_leg)`,
    );
    const truncDate = truncExprFor(granularity, sql`date`);

    const rows = await db.execute<{
      period: string;
      bucket: "assets" | "liabilities";
      balance: string;
    }>(sql`
      WITH bucket_legs AS (
        SELECT
          legs.amount,
          t.date,
          CASE WHEN a.type = 'checking_savings' THEN 'assets' ELSE 'liabilities' END AS bucket
        FROM ${schema.transactionLegs} legs
        INNER JOIN ${schema.transactions} t ON t.id = legs.transaction_id
        INNER JOIN ${schema.accounts} a ON a.id = legs.account_id
        WHERE a.group_id = ${req.auth.groupId}
          AND a.deleted_at IS NULL
          AND a.exclude_from_net_worth = false
          AND a.currency = ${currency}
          AND t.date IS NOT NULL
      ),
      first_leg AS (
        SELECT MIN(date) AS d FROM bucket_legs
      ),
      periods AS (
        -- Start no earlier than the user's first leg, even if the
        -- requested window opens before they had any activity. Avoids
        -- a long flat run of zero buckets at the head of the chart.
        SELECT generate_series(
          GREATEST(
            ${truncStart},
            ${truncFirstLeg}
          ),
          ${truncEnd},
          ${intervalLit}
        )::date AS period
      ),
      buckets(bucket) AS (VALUES ('assets'), ('liabilities')),
      grid AS (
        SELECT p.period, b.bucket
        FROM periods p CROSS JOIN buckets b
      ),
      anchors AS (
        SELECT bucket, COALESCE(SUM(amount), 0) AS balance
        FROM bucket_legs
        WHERE date < ${start}::date
        GROUP BY bucket
      ),
      period_deltas AS (
        SELECT
          (${truncDate})::date AS period,
          bucket,
          SUM(amount) AS delta
        FROM bucket_legs
        WHERE date >= ${start}::date AND date <= ${end}::date
        GROUP BY 1, 2
      )
      SELECT
        to_char(g.period, ${fmtLit}) AS period,
        g.bucket,
        (
          COALESCE((SELECT balance FROM anchors a WHERE a.bucket = g.bucket), 0)
          + COALESCE(SUM(d.delta) OVER (
              PARTITION BY g.bucket ORDER BY g.period
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ), 0)
        )::text AS balance
      FROM grid g
      LEFT JOIN period_deltas d ON d.period = g.period AND d.bucket = g.bucket
      ORDER BY g.period, g.bucket
    `);

    const decimals = currencyDecimals(currency);
    const divisor = 10 ** decimals;

    const byPeriod = new Map<string, ChartBucket>();
    for (const r of rows) {
      let bucket = byPeriod.get(r.period);
      if (!bucket) {
        bucket = { period: r.period };
        byPeriod.set(r.period, bucket);
      }
      bucket[r.bucket] = Number(r.balance) / divisor;
    }

    const items: ChartItem[] = [
      { id: "assets", name: "Assets" },
      { id: "liabilities", name: "Liabilities" },
    ];

    return {
      currency,
      items,
      buckets: [...byPeriod.values()],
    };
  });
};

function currencyDecimals(currency: string): number {
  // Three-decimal: BHD, JOD, KWD, LYD, OMR, TND, IQD. Zero-decimal:
  // JPY, KRW, VND, IDR, etc. Everything else is two. We use Intl to
  // avoid maintaining a hardcoded list — it knows ISO 4217. The result
  // is typed `number | undefined` (CLDR fallback) — default to 2 if so.
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
