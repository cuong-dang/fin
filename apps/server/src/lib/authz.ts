import {
  and,
  eq,
  type GetColumnData,
  getTableName,
  inArray,
  type InferSelectModel,
  isNull,
  type SQL,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "../db/index.js";

type OwnedTable = PgTable & {
  workspaceId: PgColumn;
};

/**
 * Look up rows by any column value, scoped to the caller's workspace.
 * The workspace check is part of the SQL (not a post-filter), so any
 * row returned is guaranteed to belong to `workspaceId`. If the table
 * is soft-deletable (has a `deletedAt` column), rows with
 * `deletedAt IS NOT NULL` are excluded.
 *
 * Single-value form returns `Row | null` (404-style). Array form
 * returns `Row[]` — possibly a partial subset of the input list, since
 * any non-owned or soft-deleted ids are filtered by the SQL.
 *
 * Common patterns:
 *   findOwned(schema.users, schema.users.id, userId, ws)         // by id
 *   findOwned(schema.users, schema.users.email, email, ws)       // by other column
 *   findOwned(schema.accounts, schema.accounts.id, ids, ws)      // batch by id
 */
export function findOwned<T extends OwnedTable, C extends PgColumn>(
  table: T,
  column: C,
  value: GetColumnData<C>,
  workspaceId: string,
): Promise<InferSelectModel<T> | null>;
export function findOwned<T extends OwnedTable, C extends PgColumn>(
  table: T,
  column: C,
  values: GetColumnData<C>[],
  workspaceId: string,
): Promise<InferSelectModel<T>[]>;
export async function findOwned<T extends OwnedTable, C extends PgColumn>(
  table: T,
  column: C,
  valueOrValues: GetColumnData<C> | GetColumnData<C>[],
  workspaceId: string,
): Promise<InferSelectModel<T> | InferSelectModel<T>[] | null> {
  const isBatch = Array.isArray(valueOrValues);
  const conditions: (SQL | undefined)[] = [
    isBatch ? inArray(column, valueOrValues) : eq(column, valueOrValues),
    eq(table.workspaceId, workspaceId),
  ];
  if ("deletedAt" in table) {
    conditions.push(isNull((table as { deletedAt: PgColumn }).deletedAt));
  }
  const rows = (await db
    .select()
    .from(table as PgTable)
    .where(and(...conditions))) as InferSelectModel<T>[];
  return isBatch ? rows : (rows[0] ?? null);
}

export async function findOwnedParent<
  T extends ActiveTable,
  P extends OwnedActiveTable,
  PC extends PgColumn,
  TC extends PgColumn,
>(
  table: T,
  parent: P,
  tableJoinColumn: TC,
  parentJoinColumn: PC,
  id: string,
  workspaceId: string,
): Promise<InferSelectModel<T> | null> {
  // `select()` after a join returns rows keyed by SQL table name —
  // `{ [tableName]: TRow, [parentName]: PRow }`. We strip the parent
  // half post-query so the caller gets just the T row.
  const rows = (await db
    .select()
    .from(table as PgTable)
    .innerJoin(parent as PgTable, eq(parentJoinColumn, tableJoinColumn))
    .where(and(ownedParentActive(table, parent, workspaceId), eq(table.id, id)))
    .limit(1)) as Array<Record<string, InferSelectModel<T>>>;
  const row = rows[0];
  return row ? (row[getTableName(table)] ?? null) : null;
}

type OwnedActiveTable = PgTable & {
  workspaceId: PgColumn;
  deletedAt: PgColumn;
};

type ActiveTable = PgTable & {
  id: PgColumn;
  deletedAt: PgColumn;
};

/**
 * Where-clause for "rows owned by this workspace AND not soft-deleted".
 * Use when the list query needs a custom projection or joins (so the
 * full chain stays inline) and only the filter wants centralizing.
 *
 *   db.select({ id, name }).from(schema.tags)
 *     .where(ownedActive(schema.tags, req.auth.workspaceId))
 */
export function ownedActive<T extends OwnedActiveTable>(
  table: T,
  workspaceId: string,
): SQL | undefined {
  return and(eq(table.workspaceId, workspaceId), isNull(table.deletedAt));
}

export function ownedParentActive<
  P extends OwnedActiveTable,
  T extends ActiveTable,
>(table: T, parent: P, workspaceId: string): SQL | undefined {
  // We also have assertions somewhere else that parents cannot be
  // soft-deleted if they contain active children.
  return and(
    eq(parent.workspaceId, workspaceId),
    isNull(parent.deletedAt),
    isNull(table.deletedAt),
  );
}

export function isActive<T extends ActiveTable>(
  table: T,
  id: string,
): SQL | undefined {
  return and(eq(table.id, id), isNull(table.deletedAt));
}

/**
 * Full select-all listing analog to `findOwned`: returns every active row
 * owned by `workspaceId`, optionally sorted. For lists that need a
 * custom projection or joins, drop down to `ownedActive` instead.
 *
 *   const bills = await listOwnedActive(
 *     schema.bills, req.auth.workspaceId, schema.bills.name,
 *   );
 */
export async function listOwnedActive<T extends OwnedActiveTable>(
  table: T,
  workspaceId: string,
  orderBy?: PgColumn,
): Promise<InferSelectModel<T>[]> {
  const q = db
    .select()
    .from(table as PgTable)
    .where(ownedActive(table, workspaceId));
  const rows = orderBy ? await q.orderBy(orderBy) : await q;
  return rows as InferSelectModel<T>[];
}
