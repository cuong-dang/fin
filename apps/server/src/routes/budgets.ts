import {
  type Budget,
  type BudgetHistoryPoint,
  type BudgetHistoryResponse,
  type BudgetSnapshot,
  createBudgetBody,
  dateString,
  idParam,
  updateBudgetBody,
} from "@fin/schemas";
import { and, between, eq, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { db, schema } from "../db/index.js";
import { findOwned, ownedActive } from "../lib/authz.js";
import {
  currentCycle,
  type CycleWindow,
  pastCycles,
} from "../lib/budget-cycle.js";
import { parseMoney } from "../lib/money.js";

// Query schemas for the snapshot/history endpoints — the client always
// supplies its local "today" so the server doesn't have to guess a
// timezone (matches the convention used by `/api/transactions`).
const snapshotQuery = z.object({ today: dateString }).strict();
const historyQuery = z
  .object({
    today: dateString,
    cycles: z.coerce.number().int().min(1).max(60).default(12),
  })
  .strict();

export const budgetRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // ─── CRUD ─────────────────────────────────────────────────────────────

  /** Raw list, used by the settings page. */
  app.get("/", async (req): Promise<Budget[]> => {
    const rows = await db
      .select({
        id: schema.budgets.id,
        categoryId: schema.budgets.categoryId,
        subcategoryId: schema.budgets.subcategoryId,
        amount: schema.budgets.amount,
        currency: schema.budgets.currency,
        frequency: schema.budgets.frequency,
      })
      .from(schema.budgets)
      .where(ownedActive(schema.budgets, req.auth.workspaceId));
    return rows.map((r) => ({
      ...r,
      amount: r.amount.toString(),
      frequency: r.frequency,
    }));
  });

  app.post("/", async (req, reply) => {
    const body = createBudgetBody.parse(req.body);

    // Validate target ownership — `optionalUuid` already enforces the
    // refine "exactly one is set", so we know which to check.
    if (body.categoryId) {
      const cat = await findOwned(
        schema.categories,
        body.categoryId,
        req.auth.workspaceId,
      );
      if (!cat) return reply.code(404).send({ error: "Category not found" });
    } else {
      const sub = await findOwnedSubcategory(
        body.subcategoryId!,
        req.auth.workspaceId,
      );
      if (!sub) return reply.code(404).send({ error: "Subcategory not found" });
    }

    const amount = parseMoney(body.amount, body.currency);
    const [row] = await db
      .insert(schema.budgets)
      .values({
        workspaceId: req.auth.workspaceId,
        categoryId: body.categoryId ?? null,
        subcategoryId: body.subcategoryId ?? null,
        amount,
        currency: body.currency,
        frequency: body.frequency,
      })
      .returning({ id: schema.budgets.id });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateBudgetBody.parse(req.body);
    const owned = await findOwned(schema.budgets, id, req.auth.workspaceId);
    if (!owned) return reply.code(404).send({ error: "Not found" });

    const amount = parseMoney(body.amount, owned.currency);
    await db
      .update(schema.budgets)
      .set({ amount, frequency: body.frequency, updatedAt: new Date() })
      .where(eq(schema.budgets.id, id));
    return reply.code(204).send();
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const owned = await findOwned(schema.budgets, id, req.auth.workspaceId);
    if (!owned) return reply.code(404).send({ error: "Not found" });
    await db
      .update(schema.budgets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.budgets.id, id));
    return reply.code(204).send();
  });

  // ─── Snapshot (current cycle) ─────────────────────────────────────────

  /**
   * Per-budget current-cycle view used by the budgets chart. Returns
   * one entry per real budget row plus synthetic "parent rollup"
   * entries for parent categories whose subcategories have budgets
   * but the parent itself does not, grouped by (parent, currency,
   * frequency).
   */
  app.get("/snapshot", async (req): Promise<BudgetSnapshot[]> => {
    const { today } = snapshotQuery.parse(req.query);
    const workspaceId = req.auth.workspaceId;

    // 1. Fetch raw budgets + display names.
    const rows = await db
      .select({
        id: schema.budgets.id,
        categoryId: schema.budgets.categoryId,
        subcategoryId: schema.budgets.subcategoryId,
        amount: schema.budgets.amount,
        currency: schema.budgets.currency,
        frequency: schema.budgets.frequency,
        categoryName: schema.categories.name,
        subcategoryName: schema.subcategories.name,
        // For subcat budgets, also the parent category id+name (for
        // the rollup grouping below). For cat budgets these are the
        // same as categoryId/categoryName.
        parentCategoryId: schema.categories.id,
        parentCategoryName: schema.categories.name,
      })
      .from(schema.budgets)
      .leftJoin(
        schema.subcategories,
        eq(schema.subcategories.id, schema.budgets.subcategoryId),
      )
      .innerJoin(
        schema.categories,
        // Join either via budget.categoryId (cat budgets) OR via
        // subcategory.categoryId (subcat budgets).
        sql`${schema.categories.id} = COALESCE(${schema.budgets.categoryId}, ${schema.subcategories.categoryId})`,
      )
      .where(ownedActive(schema.budgets, workspaceId));

    // 2. Compute actuals + cycle windows per budget.
    const snapshots: BudgetSnapshot[] = [];
    for (const r of rows) {
      const frequency = r.frequency;
      const cycle = currentCycle(frequency, today);
      const actual = await sumLineAmounts(workspaceId, {
        cycle,
        categoryId: r.categoryId,
        subcategoryId: r.subcategoryId,
        currency: r.currency,
      });
      snapshots.push({
        id: r.id,
        categoryId: r.categoryId,
        subcategoryId: r.subcategoryId,
        categoryName: r.categoryName,
        subcategoryName: r.subcategoryName,
        amount: r.amount.toString(),
        currency: r.currency,
        frequency,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        actual: actual.toString(),
        parentRollup: false,
      });
    }

    // 3. Synthesize parent rollups. For each (parentCategoryId,
    // currency, frequency) group of subcat budgets where the parent
    // itself has no budget at that (currency, frequency), emit a row
    // with summed amount and summed actual.
    const parentHasBudget = new Set(
      snapshots
        .filter((s) => s.categoryId !== null && !s.parentRollup)
        .map((s) => `${s.categoryId}|${s.currency}|${s.frequency}`),
    );
    const subcatGroups = new Map<
      string,
      {
        parentCategoryId: string;
        parentCategoryName: string;
        currency: string;
        frequency: BudgetSnapshot["frequency"];
        amount: bigint;
        actual: bigint;
        cycleStart: string;
        cycleEnd: string;
      }
    >();
    for (const r of rows) {
      if (r.subcategoryId === null) continue;
      const key = `${r.parentCategoryId}|${r.currency}|${r.frequency}`;
      if (parentHasBudget.has(key)) continue;
      const snap = snapshots.find(
        (s) => s.id !== null && s.subcategoryId === r.subcategoryId,
      )!;
      const prev = subcatGroups.get(key);
      if (prev) {
        prev.amount += BigInt(snap.amount);
        prev.actual += BigInt(snap.actual);
      } else {
        subcatGroups.set(key, {
          parentCategoryId: r.parentCategoryId,
          parentCategoryName: r.parentCategoryName,
          currency: r.currency,
          frequency: snap.frequency,
          amount: BigInt(snap.amount),
          actual: BigInt(snap.actual),
          cycleStart: snap.cycleStart,
          cycleEnd: snap.cycleEnd,
        });
      }
    }
    for (const g of subcatGroups.values()) {
      snapshots.push({
        id: null,
        categoryId: g.parentCategoryId,
        subcategoryId: null,
        categoryName: g.parentCategoryName,
        subcategoryName: null,
        amount: g.amount.toString(),
        currency: g.currency,
        frequency: g.frequency,
        cycleStart: g.cycleStart,
        cycleEnd: g.cycleEnd,
        actual: g.actual.toString(),
        parentRollup: true,
      });
    }

    return snapshots;
  });

  // ─── Per-budget history (drill chart) ─────────────────────────────────

  app.get(
    "/:id/history",
    async (req, reply): Promise<BudgetHistoryResponse> => {
      const { id } = idParam.parse(req.params);
      const { today, cycles } = historyQuery.parse(req.query);
      const owned = await findOwned(schema.budgets, id, req.auth.workspaceId);
      if (!owned) return reply.code(404).send({ error: "Not found" });
      const frequency = owned.frequency;

      const windows = pastCycles(frequency, today, cycles);
      const points: BudgetHistoryPoint[] = [];
      for (const w of windows) {
        const actual = await sumLineAmounts(req.auth.workspaceId, {
          cycle: w,
          categoryId: owned.categoryId,
          subcategoryId: owned.subcategoryId,
          currency: owned.currency,
        });
        points.push({
          cycleStart: w.start,
          cycleEnd: w.end,
          actual: actual.toString(),
        });
      }

      return {
        budget: {
          id: owned.id,
          categoryId: owned.categoryId,
          subcategoryId: owned.subcategoryId,
          amount: owned.amount.toString(),
          currency: owned.currency,
          frequency,
        },
        points,
      };
    },
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Subcategories don't carry workspaceId directly; ownership flows
 * through the parent category. This walks that join and returns the
 * subcategory row if it (and its parent) are active and in the
 * caller's workspace.
 */
async function findOwnedSubcategory(id: string, workspaceId: string) {
  const rows = await db
    .select({ id: schema.subcategories.id })
    .from(schema.subcategories)
    .innerJoin(
      schema.categories,
      eq(schema.categories.id, schema.subcategories.categoryId),
    )
    .where(
      and(
        eq(schema.subcategories.id, id),
        isNull(schema.subcategories.deletedAt),
        eq(schema.categories.workspaceId, workspaceId),
        isNull(schema.categories.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Sum signed positive line amounts on transactions whose date falls
 * in `cycle`, filtered to the budget's target (category or
 * subcategory) and currency. Pending transactions (date IS NULL)
 * fall out automatically via the BETWEEN.
 *
 * Returns minor units (bigint). 0 if no rows.
 */
async function sumLineAmounts(
  workspaceId: string,
  args: {
    cycle: CycleWindow;
    categoryId: string | null;
    subcategoryId: string | null;
    currency: string;
  },
): Promise<bigint> {
  const targetFilter = args.subcategoryId
    ? eq(schema.transactionLines.subcategoryId, args.subcategoryId)
    : eq(schema.transactionLines.categoryId, args.categoryId!);

  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.transactionLines.amount}), 0)`,
    })
    .from(schema.transactionLines)
    .innerJoin(
      schema.transactions,
      eq(schema.transactions.id, schema.transactionLines.transactionId),
    )
    .where(
      and(
        eq(schema.transactions.workspaceId, workspaceId),
        between(schema.transactions.date, args.cycle.start, args.cycle.end),
        eq(schema.transactionLines.currency, args.currency),
        targetFilter,
      ),
    );
  return BigInt(row?.total ?? 0);
}
