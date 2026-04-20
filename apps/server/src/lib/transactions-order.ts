import { and, asc, eq, sql } from "drizzle-orm";
import { type PgTx } from "../db";
import { schema } from "../db";

/**
 * Invariant: for every (group_id, date) with N completed transactions, their
 * sort_key values are exactly {1..N}. Largest = newest within the day.
 * Pending rows (date IS NULL) carry sort_key NULL.
 *
 * Helpers below are the only code that writes sort_key — route handlers call
 * them whenever a mutation could change a (group, date) bucket's membership
 * or order.
 */

/** Next sort_key for an append to the end (newest) of a (group, date) bucket. */
export async function nextSortKey(
  tx: PgTx,
  groupId: string,
  date: string,
): Promise<number> {
  const [{ max }] = await tx
    .select({
      max: sql<number>`COALESCE(MAX(${schema.transactions.sortKey}), 0)::int`,
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.groupId, groupId),
        eq(schema.transactions.date, date),
      ),
    );
  return max + 1;
}

/**
 * Renumber the (group, date) bucket to 1..N, preserving current ordering
 * (by existing sort_key ASC). Call after delete, date-change, or
 * processed→pending transitions that leave gaps.
 *
 * Uses a two-phase write (negate, then final) so we never collide with the
 * unique index during the rewrite.
 */
export async function compactSortKeys(
  tx: PgTx,
  groupId: string,
  date: string,
): Promise<void> {
  const rows = await tx
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.groupId, groupId),
        eq(schema.transactions.date, date),
      ),
    )
    .orderBy(asc(schema.transactions.sortKey));

  if (rows.length === 0) return;

  // Phase 1: move all rows to a non-conflicting temp range.
  await tx
    .update(schema.transactions)
    .set({ sortKey: sql`-${schema.transactions.sortKey}` })
    .where(
      and(
        eq(schema.transactions.groupId, groupId),
        eq(schema.transactions.date, date),
      ),
    );

  // Phase 2: assign final 1..N.
  for (let i = 0; i < rows.length; i++) {
    await tx
      .update(schema.transactions)
      .set({ sortKey: i + 1 })
      .where(eq(schema.transactions.id, rows[i].id));
  }
}

/**
 * Precondition check for `/reorder`: the non-moving ids in `bodyIds` must
 * already be in `existing` and appear there in the same relative order.
 * Violations mean the client attempted to move more than one transaction
 * in a single request, which `mergeReorderIds` does not handle.
 *
 * Returns true iff bodyIds' anchor subsequence equals existing's anchor
 * subsequence (both filtered to "ids in bodyIds other than movingId").
 */
export function anchorsPreserveOrder(
  existing: readonly string[],
  bodyIds: readonly string[],
  movingId: string,
): boolean {
  const bodyIdSet = new Set(bodyIds);
  const anchorsInBody = bodyIds.filter((id) => id !== movingId);
  const anchorsInExisting = existing.filter(
    (id) => id !== movingId && bodyIdSet.has(id),
  );
  if (anchorsInBody.length !== anchorsInExisting.length) return false;
  for (let i = 0; i < anchorsInBody.length; i++) {
    if (anchorsInBody[i] !== anchorsInExisting[i]) return false;
  }
  return true;
}

/**
 * Merge a single-mover reorder into an existing same-day order.
 *
 * Contract (single-movement):
 *   Exactly one transaction (`movingId`) changed position per request —
 *   either dropped onto a new day, or moved to a different slot within
 *   the same day. Every other id in `bodyIds` must already be on body.date
 *   and appear in `bodyIds` in its existing relative order.
 *
 * Inputs
 *   existing:  body.date ids, newest-first. May or may not include
 *              movingId (within-day reorder yes; cross-day no). The
 *              function strips it regardless and treats it as a mover.
 *   bodyIds:   desired newest-first order of a subset of body.date that
 *              includes movingId.
 *   movingId:  the sole moved transaction.
 *
 * Algorithm (one pass)
 *   Walk `existing\\{movingId}` and `bodyIds` in lockstep. When the next
 *   bodyIds entry is movingId, emit it; otherwise emit the next existing
 *   id. Whenever the emitted existing id matches the current bodyIds
 *   anchor, advance bodyIds past it. Flush any trailing bodyIds at the end.
 */
export function mergeReorderIds(
  existing: readonly string[],
  bodyIds: readonly string[],
  movingId: string,
): string[] {
  const anchors = existing.filter((id) => id !== movingId);
  const merged: string[] = [];
  let bodyIdx = 0;
  let existingIdx = 0;

  while (existingIdx < anchors.length) {
    if (bodyIdx < bodyIds.length && bodyIds[bodyIdx] === movingId) {
      merged.push(bodyIds[bodyIdx++]);
      continue;
    }
    const id = anchors[existingIdx++];
    merged.push(id);
    if (bodyIdx < bodyIds.length && id === bodyIds[bodyIdx]) {
      bodyIdx++;
    }
  }
  // Flush movingId if it trailed past the last anchor.
  while (bodyIdx < bodyIds.length) {
    if (bodyIdx != bodyIds.length - 1) {
      throw new Error(
        "Invariant: There should be 1 moving id left at the end.",
      );
    }
    merged.push(bodyIds[bodyIdx++]);
  }
  return merged;
}

/**
 * Reassign sort_key for a (group, date) bucket to match the supplied order.
 * `idsNewestFirst[0]` gets the highest sort_key (N), the last id gets 1.
 * Caller is responsible for verifying all ids are owned and same-date.
 */
export async function reassignSortKeys(
  tx: PgTx,
  groupId: string,
  date: string,
  idsNewestFirst: string[],
): Promise<void> {
  const n = idsNewestFirst.length;
  if (n === 0) return;

  // Phase 1: negate to free up 1..N.
  await tx
    .update(schema.transactions)
    .set({ sortKey: sql`-${schema.transactions.sortKey}` })
    .where(
      and(
        eq(schema.transactions.groupId, groupId),
        eq(schema.transactions.date, date),
      ),
    );

  // Phase 2: assign N, N-1, ..., 1 in order.
  for (let i = 0; i < n; i++) {
    await tx
      .update(schema.transactions)
      .set({ sortKey: n - i })
      .where(eq(schema.transactions.id, idsNewestFirst[i]));
  }
}
