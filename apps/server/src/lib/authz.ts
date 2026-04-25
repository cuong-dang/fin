import { and, eq, type InferSelectModel, isNull } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "../db";

type OwnedTable = PgTable & {
  id: PgColumn;
  groupId: PgColumn;
};

/**
 * Look up a row by id and verify it belongs to the given workspace group.
 * If the table is soft-deletable (has a `deletedAt` column), rows with
 * `deletedAt IS NOT NULL` are also treated as missing. Transactions are
 * the one user-facing entity that's hard-deleted and lacks the column.
 */
export async function findOwned<T extends OwnedTable>(
  table: T,
  id: string,
  workspaceGroupId: string,
): Promise<InferSelectModel<T> | null> {
  const conditions = [eq(table.id, id)];
  if ("deletedAt" in table) {
    conditions.push(isNull((table as { deletedAt: PgColumn }).deletedAt));
  }
  const [row] = (await db
    .select()
    .from(table as PgTable)
    .where(and(...conditions))
    .limit(1)) as Array<InferSelectModel<T> & { groupId: string }>;
  if (!row) return null;
  if (row.groupId !== workspaceGroupId) return null;
  return row;
}

type OwnedActiveTable = PgTable & {
  groupId: PgColumn;
  deletedAt: PgColumn;
};

/**
 * Where-clause for "rows owned by this workspace AND not soft-deleted".
 * Use when the list query needs a custom projection or joins (so the
 * full chain stays inline) and only the filter wants centralizing.
 *
 *   db.select({ id, name }).from(schema.tags)
 *     .where(ownedActive(schema.tags, req.auth.groupId))
 */
export function ownedActive<T extends OwnedActiveTable>(
  table: T,
  workspaceGroupId: string,
) {
  return and(eq(table.groupId, workspaceGroupId), isNull(table.deletedAt));
}

/**
 * Full select-all listing analog to `findOwned`: returns every active row
 * owned by `workspaceGroupId`, optionally sorted. For lists that need a
 * custom projection or joins, drop down to `ownedActive` instead.
 *
 *   const subs = await listOwnedActive(
 *     schema.subscriptions, req.auth.groupId, schema.subscriptions.name,
 *   );
 */
export async function listOwnedActive<T extends OwnedActiveTable>(
  table: T,
  workspaceGroupId: string,
  orderBy?: PgColumn,
): Promise<InferSelectModel<T>[]> {
  const q = db
    .select()
    .from(table as PgTable)
    .where(ownedActive(table, workspaceGroupId));
  const rows = orderBy ? await q.orderBy(orderBy) : await q;
  return rows as InferSelectModel<T>[];
}
