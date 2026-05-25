/**
 * Analytics queries follow a three-step recipe:
 *
 *   1. `build*Context(params, workspaceId)` precomputes the SQL
 *      fragments shared by every per-chart query (date truncation,
 *      period label, amount sums).
 *   2. A `handle*` function takes that context and runs the
 *      dimension-specific Drizzle query (or raw CTE for net-worth),
 *      returning raw `Row[]` aggregates.
 *   3. `shapeResponse(rows, currency, opts?)` pivots the rows into the
 *      wire shape (`AnalyticsChartResponse`): periods → buckets,
 *      group keys → items, minor-unit sums → major-unit numbers.
 *
 * Cash-flow uses a handler map (`CASH_FLOW_HANDLERS`) keyed by
 * `dimension`; by-category-&-tag and net-worth each have a single
 * dedicated handler.
 *
 * The route layer never touches the internals — each chart exposes
 * one `run*(params, workspaceId): AnalyticsChartResponse` entry
 * point. Routes validate workspace-owned references first (e.g.,
 * `accountGroupId`) and then call the entry point.
 */

import type {
  AnalyticsChartResponse,
  CashFlowDimension,
  CashFlowQuery,
  CategoryTagQuery,
  NetWorthQuery,
} from "@fin/schemas";
import {
  type ChartBucket,
  type ChartItem,
  type Granularity,
} from "@fin/schemas";
import {
  aliasedTable,
  and,
  between,
  eq,
  inArray,
  ne,
  type SQL,
  sql,
  type SQLWrapper,
} from "drizzle-orm";

import { db, schema } from "../db/index.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

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

// Inclusive date-range filter. Pass `effectiveDateExpr` when the
// handler needs refund-aware bucketing (refunds attribute to their
// original tx's date); pass `schema.transactions.date` for the raw
// posting date. `between` is column-generic at the type level but
// only cares about SQL shape at runtime — SQLWrapper covers both
// `PgColumn` and `SQL<…>` instances.
function inDateRange(start: string, end: string, col: SQLWrapper): SQL {
  return between(col as SQL<string>, start, end);
}

// ─── Refund-aware helpers ─────────────────────────────────────────────────

// Aliased `transactions` self-join target. A handler that needs the
// original-tx date does:
//   .leftJoin(originalTx, eq(originalTx.id, schema.transactions.refundedTransactionId))
// then reads `effectiveDateExpr` for grouping / filtering.
const originalTx = aliasedTable(schema.transactions, "original_tx");

// Refund txs attribute their period to the ORIGINAL tx's date, not
// their own posting date. For non-refund rows the FK is NULL and the
// COALESCE picks the row's own `date`. This is the single expression
// every refund-aware chart uses for date truncation and the
// inDateRange filter.
const effectiveDateExpr = sql<string>`COALESCE(${originalTx.date}, ${schema.transactions.date})`;

// Line-sum that treats refund lines as signed-negative, so a $30
// refund line under "Groceries" cancels a $30 expense line under
// "Groceries" in the same chart bucket. Requires the query to JOIN
// `transactions` (already true for every line-based handler).
const refundAwareLineSum = sql<string>`SUM(
  CASE WHEN ${schema.transactions.type} = 'refund'
    THEN -${schema.transactionLines.amount}
    ELSE ${schema.transactionLines.amount}
  END
)::text`;

// ─── Cash flow ─────────────────────────────────────────────────────────────

// Outgoing leg side of a transaction (debit) — used by every "out"
// dimension to restrict to legs whose amount is signed-negative.
const outflowLegFilter = sql`${schema.transactionLegs.amount} < 0`;

// Same as `outflowLegFilter` but also admits refund txs (whose legs
// are positive but should be counted as offsetting outflow in the
// same effective-date bucket). Used by `handleOutTop`, `handleOutBills`,
// and `handleOutBillsByType`. Pair with `SUM(-leg.amount)`, which
// flips the positive refund leg to a negative contribution.
const outflowOrRefundLeg = sql`(${schema.transactionLegs.amount} < 0 OR ${schema.transactions.type} = 'refund')`;

// Adjustments are bookkeeping touch-ups, not real cash-flow events;
// excluded from the outflow and net dimensions.
const excludeAdjustments = ne(schema.transactions.type, "adjustment");

// Cash flow is "money moving through everyday accounts" — only legs
// on checking/savings or credit-card accounts count as real outflow.
// A leg on a loan account (e.g., a BNPL purchase landing on the loan,
// or a payment whose source happens to be another loan) is debt
// incurred or shuffled, not cash leaving the user's pocket. Every
// out-side handler and `handleNet` apply this filter uniformly so the
// chart can't double-count financed purchases as both expense and
// loan payment.
const everydayAccountFilter = sql`${schema.accounts.type} IN ('checking_savings', 'credit_card')`;

// Optional drill on a single account group (the "Spending" /
// "Savings" picker on the cash-flow chart). Returns `undefined` when
// nothing's picked so `and(...)` collapses it cleanly.
function accountGroupFilter(id: string | undefined | null) {
  return id ? eq(schema.accounts.accountGroupId, id) : undefined;
}

type CashFlowCtx = { workspaceId: string } & CashFlowQuery & {
    periodExpr: SQL<string>;
    truncExpr: SQL<unknown>;
    legAmountExpr: SQL<string>;
    lineAmountExpr: SQL<string>;
    signedLegAmountExpr: SQL<string>;
  };

function buildCashFlowCtx(
  params: CashFlowQuery,
  workspaceId: string,
): CashFlowCtx {
  const { granularity } = params;

  const fmtLit = sql.raw(`'${PERIOD_FORMAT[granularity]}'`);
  // All cash-flow buckets use the effective date (original tx's date
  // for refunds, posting date otherwise). Handlers must JOIN
  // `originalTx` once for this expression to resolve.
  const truncExpr = truncExprFor(granularity, effectiveDateExpr);

  return {
    workspaceId,
    ...params,
    periodExpr: sql<string>`to_char(${truncExpr}, ${fmtLit})`,
    truncExpr,
    legAmountExpr: sql<string>`SUM(-${schema.transactionLegs.amount})::text`,
    lineAmountExpr: refundAwareLineSum,
    signedLegAmountExpr: sql<string>`SUM(${schema.transactionLegs.amount})::text`,
  };
}

type Handler = (ctx: CashFlowCtx) => Promise<Row[]>;

const CASH_FLOW_HANDLERS: Record<CashFlowDimension, Handler> = {
  outTop: handleOutTop,
  outExpenses: (ctx) =>
    handleCategory(ctx, { direction: "expense", drill: false }),
  outExpensesByCategory: (ctx) =>
    handleCategory(ctx, { direction: "expense", drill: true }),
  inTop: (ctx) => handleCategory(ctx, { direction: "income", drill: false }),
  inByCategory: (ctx) =>
    handleCategory(ctx, { direction: "income", drill: true }),
  outLoans: handleOutLoans,
  outBills: handleOutBills,
  outBillsByType: handleOutBillsByType,
  net: handleNet,
};

// Per-dimension item orderings. The server returns rows in
// CASE/SUM order, but the wire response should have a stable
// left-to-right legend; `shapeResponse` honours this when set.
const OUT_TOP_ORDER: ChartItem[] = [
  { id: "expense", name: "Expenses" },
  { id: "loan", name: "Loans" },
  { id: "bill", name: "Bills" },
];
const NET_ORDER: ChartItem[] = [
  { id: "in", name: "Cash in" },
  { id: "out", name: "Cash out" },
  { id: "net", name: "Net" },
];
const ITEM_ORDER_BY_DIMENSION: Partial<Record<CashFlowDimension, ChartItem[]>> =
  {
    outTop: OUT_TOP_ORDER,
    net: NET_ORDER,
  };

/**
 * Cash-flow chart entry point. Trusts that the caller has already
 * validated workspace-owned references (e.g. `accountGroupId`); this
 * fn handles only the query → shape pipeline.
 */
export async function runCashFlow(
  params: CashFlowQuery,
  workspaceId: string,
): Promise<AnalyticsChartResponse> {
  const ctx = buildCashFlowCtx(params, workspaceId);
  const rows = await CASH_FLOW_HANDLERS[params.dimension](ctx);
  const itemOrder = ITEM_ORDER_BY_DIMENSION[params.dimension];
  return shapeResponse(
    rows,
    params.currency,
    itemOrder ? { itemOrder } : undefined,
  );
}

async function handleOutTop(ctx: CashFlowCtx): Promise<Row[]> {
  const {
    workspaceId,
    currency,
    start,
    end,
    accountGroupId,
    periodExpr,
    truncExpr,
    legAmountExpr,
  } = ctx;

  const destType = sql<string>`(
    SELECT a.type FROM transaction_legs tl
    JOIN accounts a ON a.id = tl.account_id
    WHERE tl.transaction_id = ${schema.transactions.id}
      AND tl.account_id <> ${schema.transactionLegs.accountId}
    LIMIT 1
  )`;

  // Refunds carry a positive leg (money inbound) and `type='refund'`.
  // We want them to land in the 'expense' bucket as a negative offset
  // — `SUM(-leg.amount)` already inverts the +leg to a negative
  // contribution, partially canceling the original outflow in the
  // same effective-date bucket.
  const bucket = sql<string>`CASE
    WHEN ${schema.transactions.billId} IS NOT NULL THEN 'bill'
    WHEN ${schema.transactions.type} = 'transfer' AND ${destType} = 'loan' THEN 'loan'
    WHEN ${schema.transactions.type} = 'expense' THEN 'expense'
    WHEN ${schema.transactions.type} = 'refund' THEN 'expense'
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
    .leftJoin(
      originalTx,
      eq(originalTx.id, schema.transactions.refundedTransactionId),
    )
    .innerJoin(
      schema.accounts,
      eq(schema.accounts.id, schema.transactionLegs.accountId),
    )
    .where(
      and(
        eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.accounts.currency, currency),
        excludeAdjustments,
        outflowOrRefundLeg,
        everydayAccountFilter,
        inDateRange(start, end, effectiveDateExpr),
        accountGroupFilter(accountGroupId),
      ),
    )
    .groupBy(truncExpr, bucket)
    .having(sql`${bucket} IS NOT NULL`)
    .orderBy(truncExpr);
}

/**
 * Shared category/subcategory query for both `outExpenses*` and
 * `in*` dimensions. `direction` swaps the `transactions.type` filter
 * (and toggles the bill exclusion for the expense side). `drill`
 * switches between grouping by category and grouping by subcategory
 * within one category (then `ctx.categoryId` becomes required, and
 * `ctx.subcategoryId` optionally narrows to a single subcategory →
 * single series).
 */
async function handleCategory(
  ctx: CashFlowCtx,
  mode: { direction: "income" | "expense"; drill: boolean },
): Promise<Row[]> {
  const {
    workspaceId,
    start,
    end,
    currency,
    accountGroupId,
    categoryId,
    subcategoryId,
    periodExpr,
    truncExpr,
    lineAmountExpr,
  } = ctx;

  const isIncome = mode.direction === "income";
  const drilling = mode.drill;

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
    .leftJoin(
      originalTx,
      eq(originalTx.id, schema.transactions.refundedTransactionId),
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

  // Income direction: only `type='income'` rows. Refunds are NOT
  // income and are excluded automatically by this filter.
  // Expense direction: include both expense and refund rows. Refund
  // line amounts come through the CASE-signed `lineAmountExpr` as
  // negatives, so they net against the original spend in the same
  // effective-date bucket.
  const typeFilter = isIncome
    ? eq(schema.transactions.type, "income")
    : inArray(schema.transactions.type, ["expense", "refund"]);

  const where = and(
    eq(schema.transactions.workspaceId, workspaceId),
    eq(schema.transactionLines.currency, currency),
    typeFilter,
    !isIncome ? sql`${schema.transactions.billId} IS NULL` : undefined,
    !isIncome ? everydayAccountFilter : undefined,
    inDateRange(start, end, effectiveDateExpr),
    accountGroupFilter(accountGroupId),
  );

  if (drilling) {
    if (!categoryId) {
      throw new Error("categoryId required for drilling");
    }
    // With `subcategoryId` set, restrict to lines under that one
    // subcategory — the result reads as a single series (or empty if
    // the id doesn't match any line in the user's workspace; the
    // workspace filter on transactions prevents cross-tenant reads).
    return base
      .leftJoin(
        schema.subcategories,
        eq(schema.subcategories.id, schema.transactionLines.subcategoryId),
      )
      .where(
        and(
          where,
          eq(schema.transactionLines.categoryId, categoryId),
          subcategoryId
            ? eq(schema.transactionLines.subcategoryId, subcategoryId)
            : undefined,
        ),
      )
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

async function handleOutLoans(ctx: CashFlowCtx): Promise<Row[]> {
  const {
    workspaceId,
    start,
    end,
    currency,
    accountGroupId,
    loanId,
    periodExpr,
    truncExpr,
    legAmountExpr,
  } = ctx;

  // Per-loan breakdown (transfers to loan accounts). With `loanId`
  // set, restricts to a single loan and the result reads as one
  // series — same shape, just one item.
  const destLeg = aliasedTable(schema.transactionLegs, "dest_leg");
  const destAcc = aliasedTable(schema.accounts, "dest_acc");
  return (
    db
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
      // Loan payments are transfers — refunds never reach this handler.
      // The leftJoin is only here so `truncExpr` (which references
      // `originalTx`) is valid SQL. Non-refund rows leave the alias
      // NULL, so `effectiveDateExpr` collapses to `tx.date`.
      .leftJoin(
        originalTx,
        eq(originalTx.id, schema.transactions.refundedTransactionId),
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
          eq(schema.transactions.workspaceId, workspaceId),
          eq(schema.accounts.currency, currency),
          outflowLegFilter,
          everydayAccountFilter,
          inDateRange(start, end, effectiveDateExpr),
          accountGroupFilter(accountGroupId),
          loanId ? eq(destAcc.id, loanId) : undefined,
        ),
      )
      .groupBy(truncExpr, destAcc.id, destAcc.name)
      .orderBy(truncExpr)
  );
}

async function handleOutBills(ctx: CashFlowCtx): Promise<Row[]> {
  const {
    workspaceId,
    start,
    end,
    currency,
    accountGroupId,
    periodExpr,
    truncExpr,
    legAmountExpr,
  } = ctx;

  // Stack per bill type (utility / subscription / other). The type
  // string itself doubles as both id and name for the wire — the
  // client renders a friendly label from the enum.
  //
  // Refund-aware: a refund of a bill charge has `tx.bill_id = NULL`
  // but `originalTx.bill_id` points at the bill being refunded. The
  // bills join uses `COALESCE` so refund rows inherit the bill via
  // their original. `outflowOrRefundLeg` admits the refund's positive
  // leg; `SUM(-leg.amount)` flips it negative so the refund offsets
  // the original charge in the same effective-date bucket.
  const typeExpr = sql<string>`${schema.bills.type}`;
  return db
    .select({
      period: periodExpr,
      itemId: typeExpr,
      itemName: typeExpr,
      amountMinor: legAmountExpr,
    })
    .from(schema.transactionLegs)
    .innerJoin(
      schema.transactions,
      eq(schema.transactions.id, schema.transactionLegs.transactionId),
    )
    .leftJoin(
      originalTx,
      eq(originalTx.id, schema.transactions.refundedTransactionId),
    )
    .innerJoin(
      schema.accounts,
      eq(schema.accounts.id, schema.transactionLegs.accountId),
    )
    .innerJoin(
      schema.bills,
      sql`${schema.bills.id} = COALESCE(${schema.transactions.billId}, ${originalTx.billId})`,
    )
    .where(
      and(
        eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.accounts.currency, currency),
        outflowOrRefundLeg,
        everydayAccountFilter,
        inDateRange(start, end, effectiveDateExpr),
        accountGroupFilter(accountGroupId),
      ),
    )
    .groupBy(truncExpr, schema.bills.type)
    .orderBy(truncExpr);
}

async function handleOutBillsByType(ctx: CashFlowCtx): Promise<Row[]> {
  const {
    workspaceId,
    start,
    end,
    currency,
    accountGroupId,
    billType: billTypeFilter,
    billId,
    periodExpr,
    truncExpr,
    legAmountExpr,
  } = ctx;

  // Per-bill stacks. `billType` filter restricts to one bill type
  // (e.g., all subscription bills). `billId` filter restricts to a
  // single bill (leaf — series shape is the same, just one item).
  // Refund-aware via the same COALESCE join + `outflowOrRefundLeg`
  // pattern as `handleOutBills` — see comment there for the rationale.
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
    .leftJoin(
      originalTx,
      eq(originalTx.id, schema.transactions.refundedTransactionId),
    )
    .innerJoin(
      schema.accounts,
      eq(schema.accounts.id, schema.transactionLegs.accountId),
    )
    .innerJoin(
      schema.bills,
      sql`${schema.bills.id} = COALESCE(${schema.transactions.billId}, ${originalTx.billId})`,
    )
    .where(
      and(
        eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.accounts.currency, currency),
        outflowOrRefundLeg,
        everydayAccountFilter,
        inDateRange(start, end, effectiveDateExpr),
        accountGroupFilter(accountGroupId),
        billTypeFilter ? eq(schema.bills.type, billTypeFilter) : undefined,
        billId ? eq(schema.bills.id, billId) : undefined,
      ),
    )
    .groupBy(truncExpr, schema.bills.id, schema.bills.name)
    .orderBy(truncExpr);
}

async function handleNet(ctx: CashFlowCtx): Promise<Row[]> {
  const {
    workspaceId,
    start,
    end,
    currency,
    accountGroupId,
    periodExpr,
    truncExpr,
  } = ctx;

  // Three series per period — `in` (positive legs), `out`
  // (signed-negative legs), and `net = in + out`. Mantine's
  // `<CompositeChart>` with `stackOffset="sign"` then stacks `in`
  // above zero, `out` below, and the client overlays `net` as a line.
  //
  // Loan-account legs are excluded by `everydayAccountFilter` (see
  // top of this section). Internal transfers (CASA↔CASA, CC payments)
  // are filtered out too — they'd inflate both bars equally without
  // changing net. A transfer with at least one leg on a loan account
  // IS real cash flow (the CASA leg surfaces as outflow), so the
  // filter keeps those by EXISTS-checking for a loan leg.
  //
  // Inlined as a single `sql<boolean>` to avoid an extra `sql\`NOT
  // (${frag})\`` wrap, which broke chain-type inference (downstream
  // `rows` collapsed to `never[]`).
  const excludeInternalTransfers: SQL = sql`NOT (${schema.transactions.type} = 'transfer' AND NOT EXISTS (
    SELECT 1 FROM transaction_legs tl
    INNER JOIN accounts a ON a.id = tl.account_id
    WHERE tl.transaction_id = ${schema.transactions.id}
      AND a.type = 'loan'
  ))`;
  // cashIn  = income / transfer-in legs (positive).
  // cashOut = expense / transfer-out legs (negative) PLUS refund legs
  //           (positive amount, added so they partially offset the
  //           original outflow in the same effective-date period).
  // Refund legs are explicitly handled first so they never appear in
  // cashIn — refunds aren't income.
  // TODO: revisit when we model personal loans / cash advances. The
  // `amount > 0` branch below currently catches non-income,
  // non-refund positive CASA/CC legs — in practice, a transfer FROM
  // a loan account INTO a CASA/CC (e.g., a loan disbursement landing
  // in checking). We count it as cash-in today because the money
  // really did land — but it's debt, not income, and users may
  // prefer it excluded once that flow actually exists. No data
  // drives this yet, so the current behavior stands.
  const cashInExpr = sql<string>`SUM(CASE
    WHEN ${schema.transactions.type} = 'refund' THEN 0
    WHEN ${schema.transactions.type} = 'income' THEN ${schema.transactionLegs.amount}
    WHEN ${schema.transactionLegs.amount} > 0 THEN ${schema.transactionLegs.amount}
    ELSE 0
  END)::text`;
  const cashOutExpr = sql<string>`SUM(CASE
    WHEN ${schema.transactions.type} = 'refund' THEN ${schema.transactionLegs.amount}
    WHEN ${schema.transactions.type} = 'income' THEN 0
    WHEN ${schema.transactionLegs.amount} < 0 THEN ${schema.transactionLegs.amount}
    ELSE 0
  END)::text`;

  // Bind the where clause to a local first. Computing this `and(...)`
  // inline — combined with `excludeInternalTransfers` AND the
  // `originalTx` leftJoin — tips TS over the instantiation-depth
  // limit, and the chain's awaited row type collapses to `never`.
  // Hoisting it keeps the chain's inference shallow.
  const whereExpr = and(
    eq(schema.transactions.workspaceId, workspaceId),
    eq(schema.accounts.currency, currency),
    everydayAccountFilter,
    excludeAdjustments,
    excludeInternalTransfers,
    inDateRange(start, end, effectiveDateExpr),
    accountGroupFilter(accountGroupId),
  );

  // Cast the awaited chain — the combination of an aliased self-join
  // (`originalTx`), the `excludeInternalTransfers` NOT-EXISTS, and
  // three SQL<string> select fields tips TS past its instantiation
  // depth and collapses the inferred row type to `never`. The SQL is
  // sound; we name the runtime shape explicitly.
  type CashRow = { period: string; cashIn: string; cashOut: string };
  const rows = (await db
    .select({
      period: periodExpr,
      cashIn: cashInExpr,
      cashOut: cashOutExpr,
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
    .leftJoin(
      originalTx,
      eq(originalTx.id, schema.transactions.refundedTransactionId),
    )
    .where(whereExpr)
    .groupBy(truncExpr)
    .orderBy(truncExpr)) as CashRow[];

  return rows.flatMap((r) => {
    const cashIn = BigInt(r.cashIn);
    const cashOut = BigInt(r.cashOut);
    return [
      {
        period: r.period,
        itemId: "in",
        itemName: "in",
        amountMinor: cashIn.toString(),
      },
      {
        period: r.period,
        itemId: "out",
        itemName: "out",
        amountMinor: cashOut.toString(),
      },
      {
        period: r.period,
        itemId: "net",
        itemName: "net",
        amountMinor: (cashIn + cashOut).toString(),
      },
    ];
  });
}

// ─── Category & tag ────────────────────────────────────────────────────────

type CategoryTagCtx = {
  workspaceId: string;
  granularity: Granularity;
  start: string;
  end: string;
  currency: string;
  direction: "income" | "expense";
  categoryId?: string | undefined;
  subcategoryId?: string | undefined;
  tagId?: string | undefined;

  // derived
  drilling: boolean;
  periodExpr: SQL<string>;
  truncExpr: SQL<unknown>;
  amountExpr: SQL<string>;
  tagFilter?: SQL | undefined;
};

function buildCategoryTagCtx(
  params: CategoryTagQuery,
  workspaceId: string,
): CategoryTagCtx {
  const { granularity, tagId, categoryId } = params;

  const fmtLit = sql.raw(`'${PERIOD_FORMAT[granularity]}'`);
  // Refund-aware bucketing: refund lines attribute to the original
  // tx's date (so a January refund of a December expense lands in
  // December), and contribute as signed-negative so they cancel the
  // original expense line in the same category bucket. Handler must
  // JOIN `originalTx` for `effectiveDateExpr` to resolve.
  const truncExpr = truncExprFor(granularity, effectiveDateExpr);

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
    workspaceId,
    ...params,
    drilling: !!categoryId,
    periodExpr: sql<string>`to_char(${truncExpr}, ${fmtLit})`,
    truncExpr,
    amountExpr: refundAwareLineSum,
    tagFilter,
  };
}

/**
 * By-category-&-tag handler. `direction` picks the
 * `categories.kind` (expense or income); `drilling` swaps between
 * grouping by category (top level) and grouping by subcategory
 * within one category (drill, then `ctx.categoryId` is required).
 * `tagFilter`, if set, narrows lines to one tag id or to untagged
 * lines.
 *
 * Intentionally *omits* two filters that cash-flow's `handleCategory`
 * applies, because this chart partitions by category — not by
 * money-flow bucket:
 *   - No `accounts.type IN ('checking_savings', 'credit_card')`
 *     filter. Loan-account expenses (financed purchases) are
 *     counted, since they're still expense lines under some
 *     category.
 *   - No `bill_id IS NULL` exclusion. Bill-charged expense lines
 *     are counted too — they belong to whatever category the bill's
 *     default lines name.
 */
async function handleCategoryTag(ctx: CategoryTagCtx): Promise<Row[]> {
  const {
    workspaceId,
    start,
    end,
    currency,
    direction,
    categoryId,
    subcategoryId,
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
    )
    .leftJoin(
      originalTx,
      eq(originalTx.id, schema.transactions.refundedTransactionId),
    );

  const where = and(
    eq(schema.transactions.workspaceId, workspaceId),
    eq(schema.transactionLines.currency, currency),
    inDateRange(start, end, effectiveDateExpr),
    tagFilter,
  );

  if (drilling) {
    if (!categoryId) throw new Error("categoryId required for drilling");
    // With `subcategoryId` set, restrict to lines under that one
    // subcategory — the result reads as a single series (or empty if
    // the id doesn't match any line in the workspace; the workspace
    // filter on transactions prevents cross-tenant reads). Mirrors
    // cash-flow's `handleCategory` leaf.
    return base
      .leftJoin(
        schema.subcategories,
        eq(schema.subcategories.id, schema.transactionLines.subcategoryId),
      )
      .where(
        and(
          where,
          eq(schema.transactionLines.categoryId, categoryId),
          subcategoryId
            ? eq(schema.transactionLines.subcategoryId, subcategoryId)
            : undefined,
        ),
      )
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

/**
 * By-category-&-tag chart entry point. Caller is expected to have
 * validated `categoryId` ownership + `kind` and any `tagId` already.
 */
export async function runCategoryTag(
  params: CategoryTagQuery,
  workspaceId: string,
): Promise<AnalyticsChartResponse> {
  const ctx = buildCategoryTagCtx(params, workspaceId);
  const rows = await handleCategoryTag(ctx);
  return shapeResponse(rows, params.currency);
}

// ─── Net worth ─────────────────────────────────────────────────────────────

type NetWorthCtx = {
  workspaceId: string;
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

function buildNetWorthCtx(
  params: NetWorthQuery,
  workspaceId: string,
): NetWorthCtx {
  const { granularity, start, end } = params;

  const fmtLit = sql.raw(`'${PERIOD_FORMAT[granularity]}'`);
  const intervalLit = sql.raw(`'1 ${TRUNC_UNIT[granularity]}'::interval`);

  return {
    workspaceId,
    ...params,

    truncStart: truncExprFor(granularity, sql`${start}::date`),
    truncEnd: truncExprFor(granularity, sql`${end}::date`),
    truncFirstLeg: truncExprFor(granularity, sql`(SELECT d FROM first_leg)`),
    truncDate: truncExprFor(granularity, sql`date`),

    periodExpr: sql<string>`to_char(g.period, ${fmtLit})`,
    intervalLit,
  };
}

type NetWorthRow = {
  period: string;
  bucket: "assets" | "liabilities";
  balance: string;
};

async function fetchNetWorthRows(ctx: NetWorthCtx): Promise<NetWorthRow[]> {
  const {
    workspaceId,
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
        -- Refunds attribute their cash movement to the ORIGINAL tx's
        -- date, not their own posting date. This keeps net-worth from
        -- dipping and rebounding for what was ultimately a wash. The
        -- LEFT JOIN leaves \`orig.date\` NULL for non-refund rows, so
        -- the COALESCE collapses to \`t.date\` (the row's own date).
        COALESCE(orig.date, t.date) AS date
      FROM ${schema.transactionLegs} legs
      JOIN ${schema.transactions} t ON t.id = legs.transaction_id
      LEFT JOIN ${schema.transactions} orig ON orig.id = t.refunded_transaction_id
      JOIN ${schema.accounts} a ON a.id = legs.account_id
      JOIN ${schema.accountGroups} ag ON ag.id = a.account_group_id
      WHERE ag.workspace_id = ${workspaceId}
        AND ag.deleted_at IS NULL
        AND a.deleted_at IS NULL
        AND a.exclude_from_net_worth = false
        AND a.currency = ${currency}
        AND COALESCE(orig.date, t.date) IS NOT NULL
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

// Net-worth has a fixed three-series ordering with user-friendly
// labels; pass these into `shapeResponse` so the wire response uses
// "Assets" / "Liabilities" / "Net worth" rather than the raw enum
// strings. `net` is emitted alongside assets + liabilities so the
// client can render it as a line on top of the diverging stacks
// without an ad-hoc client-side sum.
const NET_WORTH_ORDER: ChartItem[] = [
  { id: "assets", name: "Assets" },
  { id: "liabilities", name: "Liabilities" },
  { id: "net", name: "Net worth" },
];

/**
 * Net-worth chart entry point. No caller validation needed (no
 * referenced entities beyond the workspace itself).
 */
export async function runNetWorth(
  params: NetWorthQuery,
  workspaceId: string,
): Promise<AnalyticsChartResponse> {
  const ctx = buildNetWorthCtx(params, workspaceId);
  const rows = await fetchNetWorthRows(ctx);

  // Compute the per-period net (assets + liabilities — liabilities
  // arrive already signed-negative from the CTE) in JS. Doing it
  // here instead of in SQL keeps the (already complex) cumulative-
  // balance CTE focused on its job.
  const netByPeriod = new Map<string, bigint>();
  for (const r of rows) {
    netByPeriod.set(
      r.period,
      (netByPeriod.get(r.period) ?? 0n) + BigInt(r.balance),
    );
  }

  return shapeResponse(
    [
      ...rows.map((r) => ({
        period: r.period,
        itemId: r.bucket,
        itemName: r.bucket,
        amountMinor: r.balance,
      })),
      ...[...netByPeriod].map(([period, total]) => ({
        period,
        itemId: "net",
        itemName: "net",
        amountMinor: total.toString(),
      })),
    ],
    params.currency,
    { itemOrder: NET_WORTH_ORDER },
  );
}

// ─── Response shaping ──────────────────────────────────────────────────────

/**
 * Pivot raw `Row[]` aggregates into the wire shape. Each row's
 * `itemId` becomes a series id; each `period` becomes a bucket whose
 * `[itemId]` column holds the value in major currency units.
 *
 * `itemOrder`, when provided, fixes the order of the `items` array
 * (filtered to ids actually present in the rows). Without it, items
 * are sorted alphabetically by name. Null ids ("Other"-style)
 * collapse to a single synthetic item.
 */
function shapeResponse(
  rows: Row[],
  currency: string,
  options?: { itemOrder?: ChartItem[] },
) {
  const decimals = currencyDecimals(currency);
  const divisor = 10 ** decimals;

  const byPeriod = new Map<string, ChartBucket>();
  const itemsById = new Map<string, string>();

  for (const r of rows) {
    const id = r.itemId ?? "__none__";
    const name = r.itemName ?? "Other";
    const amount = Number(r.amountMinor);
    itemsById.set(id, name);

    let bucket = byPeriod.get(r.period);
    if (!bucket) {
      bucket = { period: r.period };
      byPeriod.set(r.period, bucket);
    }
    bucket[id] = amount / divisor;
  }

  const items = options?.itemOrder
    ? options.itemOrder.filter((i) => i.id !== null && itemsById.has(i.id))
    : [...itemsById.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

  return {
    currency,
    items,
    buckets: [...byPeriod.values()],
  };
}
