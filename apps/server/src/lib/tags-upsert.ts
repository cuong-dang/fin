import { schema, type Tx } from "../db/index.js";
import { findOwned } from "./authz.js";

/**
 * Upsert each tag name for the workspace and return a `name → id` map.
 */
export async function upsertTags(
  tx: Tx,
  names: string[],
  workspaceId: string,
): Promise<Map<string, string>> {
  if (names.length === 0) throw new Error("upsertTags called with no tag names.");
  const unique = [...new Set(names)];

  const existing = await findOwned(schema.tags, schema.tags.name, names, workspaceId);
  const byName = new Map(existing.map((t) => [t.name, t.id]));

  const toInsert = unique.filter((n) => !byName.has(n));
  if (toInsert.length > 0) {
    const inserted = await tx
      .insert(schema.tags)
      .values(toInsert.map((name) => ({ workspaceId: workspaceId, name })))
      .returning({ id: schema.tags.id, name: schema.tags.name });
    for (const t of inserted) byName.set(t.name, t.id);
  }
  return byName;
}
