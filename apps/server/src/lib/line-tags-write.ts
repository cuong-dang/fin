import type { schema } from "../db/index.js";
import { type Tx } from "../db/index.js";
import { upsertTags } from "./tags-upsert.js";

// Each "line" (transaction line / bill default line / loan default line) has
// a parallel `*_line_tags` junction table with the same `{ lineId, tagId }`
// shape. This helper upserts the tag rows by name and writes the junction
// rows in one place — callers just hand it the right junction table.
type LineTagJunction =
  | typeof schema.transactionLineTags
  | typeof schema.billDefaultLineTags
  | typeof schema.loanDefaultLineTags;

export async function attachLineTags(
  tx: Tx,
  junctionTable: LineTagJunction,
  lineId: string,
  tagNames: string[] | undefined,
  workspaceId: string,
): Promise<void> {
  if (!tagNames || tagNames.length === 0) return;
  const byName = await upsertTags(tx, tagNames, workspaceId);
  const unique = [...new Set(tagNames)];
  await tx.insert(junctionTable).values(
    unique.map((name) => {
      const tagId = byName.get(name);
      if (!tagId) throw new Error(`Invariant: tag "${name}" not resolved`);
      return { lineId, tagId };
    }),
  );
}
