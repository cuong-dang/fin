import { and, eq, type InferSelectModel, isNull } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "../db/index.js";

type OwnedTable = PgTable & {
  id: PgColumn;
  workspaceId: PgColumn;
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
  workspaceId: string,
): Promise<InferSelectModel<T> | null> {
  const conditions = [eq(table.id, id)];
  if ("deletedAt" in table) {
    conditions.push(isNull((table as { deletedAt: PgColumn }).deletedAt));
  }
  const [row] = (await db
    .select()
    .from(table as PgTable)
    .where(and(...conditions))
    .limit(1)) as Array<InferSelectModel<T> & { workspaceId: string }>;
  if (!row) return null;
  if (row.workspaceId !== workspaceId) return null;
  return row;
}

type OwnedActiveTable = PgTable & {
  workspaceId: PgColumn;
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
) {
  return and(eq(table.workspaceId, workspaceId), isNull(table.deletedAt));
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
