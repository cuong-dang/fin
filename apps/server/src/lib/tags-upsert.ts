import { and, eq, inArray, isNull } from "drizzle-orm";

import { db, schema } from "../db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Upsert each tag name for the workspace and return a `name → id` map.
 * Soft-deleted tags are ignored on lookup — a new active tag is created
 * if no *active* tag with that name exists. The partial unique index on
 * `(group_id, name) WHERE deleted_at IS NULL` permits this.
 */
export async function upsertTags(
  tx: Tx,
  names: string[],
  workspaceGroupId: string,
): Promise<Map<string, string>> {
  const unique = [...new Set(names)];
  if (unique.length === 0) return new Map();

  const existing = await tx
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(
      and(
        eq(schema.tags.groupId, workspaceGroupId),
        inArray(schema.tags.name, unique),
        isNull(schema.tags.deletedAt),
      ),
    );
  const byName = new Map(existing.map((t) => [t.name, t.id]));

  const toInsert = unique.filter((n) => !byName.has(n));
  if (toInsert.length > 0) {
    const inserted = await tx
      .insert(schema.tags)
      .values(toInsert.map((name) => ({ groupId: workspaceGroupId, name })))
      .returning({ id: schema.tags.id, name: schema.tags.name });
    for (const t of inserted) byName.set(t.name, t.id);
  }
  return byName;
}
