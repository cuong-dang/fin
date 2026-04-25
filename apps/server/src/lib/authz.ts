import { eq, type InferSelectModel } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "../db";

type OwnedTable = PgTable & { id: PgColumn; groupId: PgColumn };

/**
 * Look up a row by id and verify it belongs to the given workspace group.
 * Returns null if missing or not owned.
 */
export async function findOwned<T extends OwnedTable>(
  table: T,
  id: string,
  workspaceGroupId: string,
): Promise<InferSelectModel<T> | null> {
  const [row] = (await db
    .select()
    .from(table as PgTable)
    .where(eq(table.id, id))
    .limit(1)) as Array<InferSelectModel<T> & { groupId: string }>;
  if (!row) return null;
  if (row.groupId !== workspaceGroupId) return null;
  return row;
}
