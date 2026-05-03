import {
  CashFlowQuery,
  CategorySpendingQuery,
  type ChartBucket,
  type Granularity,
  NetWorthQuery,
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

import { db, schema } from "../db";

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

type Row = {
  period: string;
  itemId: string | null;
  itemName: string | null;
  amountMinor: string;
};

// Cash-flow

type CashFlowQueryCtx = { userGroupId: string } & CashFlowQuery & {
    periodExpr: SQL<string>;
    truncExpr: SQL<unknown>;
    legAmountExpr: SQL<string>;
    lineAmountExpr: SQL<string>;
    signedLegAmountExpr: SQL<string>;
  };

export function buildContext(
  params: CashFlowQuery,
  userGroupId: string,
): CashFlowQueryCtx {
  const { granularity } = params;

  const fmtLit = sql.raw(`'${PERIOD_FORMAT[granularity]}'`);
  const truncExpr = truncExprFor(granularity, sql`${schema.transactions.date}`);

  return {
    userGroupId,
    ...params,
    periodExpr: sql<string>`to_char(${truncExpr}, ${fmtLit})`,
    truncExpr,
    legAmountExpr: sql<string>`SUM(-${schema.transactionLegs.amount})::text`,
    lineAmountExpr: sql<string>`SUM(${schema.transactionLines.amount})::text`,
    signedLegAmountExpr: sql<string>`SUM(${schema.transactionLegs.amount})::text`,
  };
}

type Handler = (ctx: CashFlowQueryCtx) => Promise<Row[]>;

export const CASH_FLOW_HANDLERS: Record<string, Handler> = {
  outTop: handleOutTop,
  outExpenses: handleCategory,
  outExpensesByCategory: handleCategory,
  inTop: handleCategory,
  inByCategory: handleCategory,
  outLoans: handleOutLoans,
  outBills: handleOutBills,
  net: handleNet,
};

async function handleOutTop(ctx: CashFlowQueryCtx): Promise<Row[]> {
  const {
    userGroupId,
    currency,
    start,
    end,
    groupId,
    periodExpr,
    truncExpr,
    legAmountExpr,
  } = ctx;

  // Assuming only 1 transfer within a tx.
  const destType = sql<string>`(
    SELECT a.type FROM transaction_legs tl
    JOIN accounts a ON a.id = tl.account_id
    WHERE tl.transaction_id = ${schema.transactions.id}
      AND tl.account_id <> ${schema.transactionLegs.accountId}
    LIMIT 1
  )`;

  const bucket = sql<string>`CASE
    WHEN ${schema.transactions.billId} IS NOT NULL THEN 'bill'
    WHEN ${schema.transactions.type} = 'transfer' AND ${destType} = 'loan' THEN 'loan'
    WHEN ${schema.transactions.type} = 'expense' THEN 'expense'
  END`;

  return db
    .select({
      period: periodExpr,
      itemId: bucket,
      itemName: bucket,
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
        eq(schema.transactions.groupId, userGroupId),
        eq(schema.accounts.currency, currency),
        ne(schema.transactions.type, "adjustment"),
        sql`${schema.transactionLegs.amount} < 0`,
        gte(schema.transactions.date, start),
        lte(schema.transactions.date, end),
        groupId ? eq(schema.accounts.accountGroupId, groupId) : undefined,
      ),
    )
    .groupBy(truncExpr, bucket)
    .having(sql`${bucket} IS NOT NULL`)
    .orderBy(truncExpr);
}

async function handleCategory(ctx: CashFlowQueryCtx): Promise<Row[]> {
  const {
    userGroupId,
    start,
    end,
    currency,
    dimension,
    groupId,
    categoryId,
    periodExpr,
    truncExpr,
    lineAmountExpr,
  } = ctx;

  const isIncome = dimension.startsWith("in");
  const drilling = dimension.endsWith("ByCategory");

  const base = db
    .select({
      period: periodExpr,
      itemId: drilling
        ? schema.transactionLines.subcategoryId
        : schema.categories.id,
      itemName: drilling ? schema.subcategories.name : schema.categories.name,
      amountMinor: lineAmountExpr,
    })
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

  const where = and(
    eq(schema.transactions.groupId, userGroupId),
    eq(schema.transactionLines.currency, currency),
    eq(schema.transactions.type, isIncome ? "income" : "expense"),
    !isIncome ? sql`${schema.transactions.billId} IS NULL` : undefined,
    gte(schema.transactions.date, start),
    lte(schema.transactions.date, end),
    groupId ? eq(schema.accounts.accountGroupId, groupId) : undefined,
  );

  if (drilling) {
    if (!categoryId) {
      throw new Error("categoryId required for drilling");
    }
    return base
      .leftJoin(
        schema.subcategories,
        eq(schema.subcategories.id, schema.transactionLines.subcategoryId),
      )
      .where(and(where, eq(schema.transactionLines.categoryId, categoryId)))
      .groupBy(
        truncExpr,
        schema.transactionLines.subcategoryId,
        schema.subcategories.name,
      )
      .orderBy(truncExpr);
  }

  return base
    .innerJoin(
      schema.categories,
      eq(schema.categories.id, schema.transactionLines.categoryId),
    )
    .where(where)
    .groupBy(truncExpr, schema.categories.id, schema.categories.name)
    .orderBy(truncExpr);
}

async function handleOutLoans(ctx: CashFlowQueryCtx): Promise<Row[]> {
  const {
    userGroupId,
    start,
    end,
    currency,
    groupId,
    periodExpr,
    truncExpr,
    legAmountExpr,
  } = ctx;

  // Per-loan breakdown (transfers to loan accounts).
  const destLeg = aliasedTable(schema.transactionLegs, "dest_leg");
  const destAcc = aliasedTable(schema.accounts, "dest_acc");
  return db
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
        eq(schema.transactions.groupId, userGroupId),
        eq(schema.accounts.currency, currency),
        sql`${schema.transactionLegs.amount} < 0`,
        gte(schema.transactions.date, start),
        lte(schema.transactions.date, end),
        groupId ? eq(schema.accounts.accountGroupId, groupId) : undefined,
      ),
    )
    .groupBy(truncExpr, destAcc.id, destAcc.name)
    .orderBy(truncExpr);
}

async function handleOutBills(ctx: CashFlowQueryCtx): Promise<Row[]> {
  const {
    userGroupId,
    start,
    end,
    currency,
    groupId,
    periodExpr,
    truncExpr,
    legAmountExpr,
  } = ctx;

  return db
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
    .innerJoin(schema.bills, eq(schema.bills.id, schema.transactions.billId))
    .where(
      and(
        eq(schema.transactions.groupId, userGroupId),
        eq(schema.accounts.currency, currency),
        sql`${schema.transactionLegs.amount} < 0`,
        gte(schema.transactions.date, start),
        lte(schema.transactions.date, end),
        groupId ? eq(schema.accounts.accountGroupId, groupId) : undefined,
      ),
    )
    .groupBy(truncExpr, schema.bills.id, schema.bills.name)
    .orderBy(truncExpr);
}

async function handleNet(ctx: CashFlowQueryCtx): Promise<Row[]> {
  const {
    userGroupId,
    start,
    end,
    currency,
    groupId,
    periodExpr,
    truncExpr,
    signedLegAmountExpr,
  } = ctx;

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
      SELECT 1 FROM transaction_legs tl
      INNER JOIN accounts a ON a.id = tl.account_id
      WHERE tl.transaction_id = ${schema.transactions.id}
        AND a.type = 'loan'
    )
  `;
  return db
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
        eq(schema.transactions.groupId, userGroupId),
        eq(schema.accounts.currency, currency),
        sql`${schema.accounts.type} IN ('checking_savings', 'credit_card')`,
        ne(schema.transactions.type, "adjustment"),
        sql`NOT (${internalTransfer})`,
        gte(schema.transactions.date, start),
        lte(schema.transactions.date, end),
        groupId ? eq(schema.accounts.accountGroupId, groupId) : undefined,
      ),
    )
    .groupBy(truncExpr, sideExpr, sideNameExpr)
    .orderBy(truncExpr);
}

// Category-spending
type CategorySpendingCtx = {
  userGroupId: string;
  granularity: Granularity;
  start: string;
  end: string;
  currency: string;
  direction: "income" | "expense";
  categoryId?: string;
  tagId?: string;

  // derived
  drilling: boolean;
  periodExpr: SQL<string>;
  truncExpr: SQL<unknown>;
  amountExpr: SQL<string>;
  tagFilter?: SQL;
};

export function buildCategorySpendingCtx(
  params: CategorySpendingQuery,
  userGroupId: string,
): CategorySpendingCtx {
  const { granularity, tagId, categoryId } = params;

  const fmtLit = sql.raw(`'${PERIOD_FORMAT[granularity]}'`);
  const truncExpr = truncExprFor(granularity, sql`${schema.transactions.date}`);

  const tagFilter =
    tagId === "__none__"
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

  return {
    userGroupId,
    ...params,
    drilling: !!categoryId,
    periodExpr: sql<string>`to_char(${truncExpr}, ${fmtLit})`,
    truncExpr,
    amountExpr: sql<string>`SUM(${schema.transactionLines.amount})::text`,
    tagFilter,
  };
}

export async function handleCategorySpending(
  ctx: CategorySpendingCtx,
): Promise<Row[]> {
  const {
    userGroupId,
    start,
    end,
    currency,
    direction,
    categoryId,
    drilling,
    periodExpr,
    truncExpr,
    amountExpr,
    tagFilter,
  } = ctx;

  const base = db
    .select({
      period: periodExpr,
      itemId: drilling
        ? schema.transactionLines.subcategoryId
        : schema.categories.id,
      itemName: drilling ? schema.subcategories.name : schema.categories.name,
      amountMinor: amountExpr,
    })
    .from(schema.transactionLines)
    .innerJoin(
      schema.transactions,
      eq(schema.transactions.id, schema.transactionLines.transactionId),
    );

  const where = and(
    eq(schema.transactions.groupId, userGroupId),
    eq(schema.transactionLines.currency, currency),
    gte(schema.transactions.date, start),
    lte(schema.transactions.date, end),
    tagFilter,
  );

  if (drilling) {
    if (!categoryId) throw new Error("categoryId required");

    return base
      .leftJoin(
        schema.subcategories,
        eq(schema.subcategories.id, schema.transactionLines.subcategoryId),
      )
      .where(and(where, eq(schema.transactionLines.categoryId, categoryId)))
      .groupBy(
        truncExpr,
        schema.transactionLines.subcategoryId,
        schema.subcategories.name,
      )
      .orderBy(truncExpr);
  }

  return base
    .innerJoin(
      schema.categories,
      eq(schema.categories.id, schema.transactionLines.categoryId),
    )
    .where(and(where, eq(schema.categories.kind, direction)))
    .groupBy(truncExpr, schema.categories.id, schema.categories.name)
    .orderBy(truncExpr);
}

// Net worth
type NetWorthCtx = {
  userGroupId: string;
  granularity: Granularity;
  start: string;
  end: string;
  currency: string;

  truncStart: SQL<unknown>;
  truncEnd: SQL<unknown>;
  truncFirstLeg: SQL<unknown>;
  truncDate: SQL<unknown>;

  periodExpr: SQL<string>;
  intervalLit: SQL;
};

export function buildNetWorthContext(
  params: NetWorthQuery,
  userGroupId: string,
): NetWorthCtx {
  const { granularity, start, end } = params;

  const fmtLit = sql.raw(`'${PERIOD_FORMAT[granularity]}'`);
  const intervalLit = sql.raw(`'1 ${TRUNC_UNIT[granularity]}'::interval`);

  return {
    userGroupId,
    ...params,

    truncStart: truncExprFor(granularity, sql`${start}::date`),
    truncEnd: truncExprFor(granularity, sql`${end}::date`),
    truncFirstLeg: truncExprFor(granularity, sql`(SELECT d FROM first_leg)`),
    truncDate: truncExprFor(granularity, sql`date`),

    periodExpr: sql<string>`to_char(period, ${fmtLit})`,
    intervalLit,
  };
}

type NetWorthRow = {
  period: string;
  bucket: "assets" | "liabilities";
  balance: string;
};

export async function fetchNetWorthRows(
  ctx: NetWorthCtx,
): Promise<NetWorthRow[]> {
  const {
    userGroupId,
    currency,
    start,
    end,
    truncStart,
    truncEnd,
    truncFirstLeg,
    truncDate,
    intervalLit,
    periodExpr,
  } = ctx;

  return db.execute<NetWorthRow>(sql`
    WITH bucket_legs AS (
      SELECT
        CASE
          WHEN a.type = 'checking_savings' THEN 'assets'
          ELSE 'liabilities'
        END AS bucket,
        legs.amount,
        t.date,
      FROM ${schema.transactionLegs} legs
      JOIN ${schema.transactions} t ON t.id = legs.transaction_id
      JOIN ${schema.accounts} a ON a.id = legs.account_id
      WHERE a.group_id = ${userGroupId}
        AND a.deleted_at IS NULL
        AND a.exclude_from_net_worth = false
        AND a.currency = ${currency}
        AND t.date IS NOT NULL
    ),
    first_leg AS (
      SELECT MIN(date) AS d FROM bucket_legs
    ),
    periods AS (
      SELECT generate_series(
        GREATEST(${truncStart}, ${truncFirstLeg}),
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
      ${periodExpr} AS period,
      g.bucket,
      (
        COALESCE((SELECT balance FROM anchors a WHERE a.bucket = g.bucket), 0)
        + COALESCE(SUM(d.delta) OVER (
            PARTITION BY g.bucket
            ORDER BY g.period
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ), 0)
      )::text AS balance
    FROM grid g
    LEFT JOIN period_deltas d
      ON d.period = g.period AND d.bucket = g.bucket
    ORDER BY g.period, g.bucket
  `);
}

// Shape response
export function shapeResponse(
  rows: Row[],
  currency: string,
  dimension: string,
) {
  const decimals = currencyDecimals(currency);
  const divisor = 10 ** decimals;

  const byPeriod = new Map<string, ChartBucket>();
  const itemsById = new Map<string, string>();

  for (const r of rows.map((r) => normalizeRow(r))) {
    const id = r.itemId;
    itemsById.set(id, r.itemName);

    let bucket = byPeriod.get(r.period);
    if (!bucket) {
      bucket = { period: r.period };
      byPeriod.set(r.period, bucket);
    }

    bucket[id] = r.amount / divisor;
  }

  const items =
    dimension === "outTop"
      ? [
          { id: "expense", name: "Expenses" },
          { id: "loan", name: "Loans" },
          { id: "bill", name: "Bills" },
        ].filter((i) => itemsById.has(i.id))
      : [...itemsById.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name));

  return {
    currency,
    items,
    buckets: [...byPeriod.values()],
  };
}

export function shapeNetWorthResponse(rows: NetWorthRow[], currency: string) {
  return shapeResponse(
    rows.map((r) => ({
      period: r.period,
      itemId: r.bucket,
      itemName: r.bucket,
      amountMinor: r.balance,
    })),
    currency,
    "netWorth",
  );
}

function normalizeRow(r: Row) {
  return {
    period: r.period,
    itemId: r.itemId ?? "__none__",
    itemName: r.itemName ?? "Other",
    amount: Number(r.amountMinor),
  };
}
