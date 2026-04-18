import { eq, type InferSelectModel } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";

type OwnedTable = PgTable & { id: PgColumn; groupId: PgColumn };

/**
 * Look up a row by id and verify it belongs to the given workspace group.
 * Returns null if missing or not owned — callers decide how to surface that
 * (throw in server actions, notFound() in pages).
 *
 * Works on any table that has both `id` and `groupId` columns.
 */
export async function findOwned<T extends OwnedTable>(
  table: T,
  id: string,
  workspaceGroupId: string,
): Promise<InferSelectModel<T> | null> {
  // Drizzle's generic surface for .from() is finicky; the cast is a local
  // escape hatch. The runtime query is correct — we pin `id` and `groupId`
  // as columns via the type constraint above.
  const [row] = (await db
    .select()
    .from(table as PgTable)
    .where(eq(table.id, id))
    .limit(1)) as Array<InferSelectModel<T> & { groupId: string }>;
  if (!row) return null;
  if (row.groupId !== workspaceGroupId) return null;
  return row;
}
