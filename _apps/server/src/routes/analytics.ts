import {
  type AnalyticsChartResponse,
  cashFlowQuery,
  categorySpendingQuery,
  netWorthQuery,
} from "@fin/schemas";
import type { FastifyPluginAsync } from "fastify";

import { schema } from "../db";
import {
  buildCategorySpendingCtx,
  buildContext,
  buildNetWorthContext,
  CASH_FLOW_HANDLERS,
  fetchNetWorthRows,
  handleCategorySpending,
  shapeNetWorthResponse,
  shapeResponse,
} from "../lib/analytics";
import { findOwned } from "../lib/authz";

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
  app.get("/cash-flow", async (req, reply): Promise<AnalyticsChartResponse> => {
    const params = cashFlowQuery.parse(req.query);

    if (params.groupId) {
      const group = await findOwned(
        schema.accountGroups,
        params.groupId,
        req.auth.groupId,
      );
      if (!group) return reply.code(404).send({ error: "Not found" });
    }

    const ctx = buildContext(params, req.auth.groupId);

    const handler = CASH_FLOW_HANDLERS[params.dimension];
    if (!handler) throw new Error(`Unhandled dimension ${params.dimension}`);

    const rows = await handler(ctx);

    return shapeResponse(rows, params.currency, params.dimension);
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
   * that tag; the literal `"__none__"` restricts to untagged lines.
   *
   * Buckets use ids as keys (not names) so the client can robustly
   * track stacks even if names contain special chars.
   */
  app.get("/category-spending", async (req, reply) => {
    const params = categorySpendingQuery.parse(req.query);

    if (params.categoryId) {
      const cat = await findOwned(
        schema.categories,
        params.categoryId,
        req.auth.groupId,
      );
      if (!cat || cat.kind !== params.direction) {
        return reply.code(400).send({
          error: `Category must be ${params.direction}-kind`,
        });
      }
    }

    if (params.tagId && params.tagId !== "__none__") {
      const tag = await findOwned(schema.tags, params.tagId, req.auth.groupId);
      if (!tag) return reply.code(400).send({ error: "Tag not found" });
    }

    const ctx = buildCategorySpendingCtx(params, req.auth.groupId);
    const rows = await handleCategorySpending(ctx);

    return shapeResponse(rows, params.currency, "categorySpending");
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
  app.get("/net-worth", async (req) => {
    const params = netWorthQuery.parse(req.query);
    const ctx = buildNetWorthContext(params, req.auth.groupId);
    const rows = await fetchNetWorthRows(ctx);

    return shapeNetWorthResponse(rows, params.currency);
  });
};
