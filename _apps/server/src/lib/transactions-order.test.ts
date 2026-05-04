import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { anchorsPreserveOrder, mergeReorderIds } from "./transactions-order";

// Contract: one transaction moves per request, identified by `movingId`.
// Other ids in bodyIds must be on body.date and in their existing order.
//
// Test conventions:
//   - Numeric string ids reflect sort_keys in the bucket (newest = largest).
//     `existing = ["5", "4", "3", "2", "1"]` reads as sort_key 5..1 DESC.
//   - Movers use ids outside the existing range — "10", "20" — so the
//     reader sees at a glance which id is the one being moved.
describe("mergeReorderIds — cross-day insert (movingId not in existing)", () => {
  it("between two consecutive anchors — [3, 10, 2]", () => {
    assert.deepEqual(
      mergeReorderIds(["5", "4", "3", "2", "1"], ["3", "10", "2"], "10"),
      ["5", "4", "3", "10", "2", "1"],
    );
  });

  it("between two adjacent anchors with non-listed rows between — [5, 10, 3]", () => {
    // Canonical example: 10 sits right after 5 (between 5 and 4),
    // preserving non-listed 4 below it.
    assert.deepEqual(
      mergeReorderIds(["6", "5", "4", "3", "2", "1"], ["5", "10", "3"], "10"),
      ["6", "5", "10", "4", "3", "2", "1"],
    );
  });

  it("between anchors with a span of non-listed rows — [5, 10, 1]", () => {
    assert.deepEqual(
      mergeReorderIds(["5", "4", "3", "2", "1"], ["5", "10", "1"], "10"),
      ["5", "10", "4", "3", "2", "1"],
    );
  });

  it("mover first (no prev anchor) — [10, 4, 3]", () => {
    // No anchor above 10 → 10 lands at the top (before the first emitted existing).
    assert.deepEqual(
      mergeReorderIds(["5", "4", "3", "2", "1"], ["10", "4", "3"], "10"),
      ["10", "5", "4", "3", "2", "1"],
    );
  });

  it("mover last (trailing after last anchor) — [4, 3, 10]", () => {
    assert.deepEqual(
      mergeReorderIds(["5", "4", "3", "2", "1"], ["4", "3", "10"], "10"),
      ["5", "4", "3", "10", "2", "1"],
    );
  });

  it("mover only, bodyIds = [10] into non-empty existing", () => {
    assert.deepEqual(mergeReorderIds(["3", "2", "1"], ["10"], "10"), [
      "10",
      "3",
      "2",
      "1",
    ]);
  });

  it("mover only, bodyIds = [10] into empty existing", () => {
    assert.deepEqual(mergeReorderIds([], ["10"], "10"), ["10"]);
  });
});

describe("mergeReorderIds — within-day reorder (movingId IS in existing)", () => {
  it("identity when movingId keeps its slot", () => {
    // 2 dragged but dropped in its original position; output equals existing.
    assert.deepEqual(mergeReorderIds(["3", "2", "1"], ["3", "2", "1"], "2"), [
      "3",
      "2",
      "1",
    ]);
  });

  it("promote to top — [2, 3, 1] with movingId 2", () => {
    assert.deepEqual(mergeReorderIds(["3", "2", "1"], ["2", "3", "1"], "2"), [
      "2",
      "3",
      "1",
    ]);
  });

  it("demote to bottom — [3, 1, 2] with movingId 2", () => {
    assert.deepEqual(mergeReorderIds(["3", "2", "1"], ["3", "1", "2"], "2"), [
      "3",
      "1",
      "2",
    ]);
  });

  it("move middle-of-pack to top across non-listed rows", () => {
    // In the filtered view the user sees [5, 3], drags 3 above 5 → bodyIds [3, 5].
    // 3 slots in above everything, others shift down a position.
    assert.deepEqual(
      mergeReorderIds(["5", "4", "3", "2", "1"], ["3", "5"], "3"),
      ["3", "5", "4", "2", "1"],
    );
  });

  it("drag from oldest to newest", () => {
    // existing [5..1], bodyIds [1, 5] with movingId=1.
    assert.deepEqual(
      mergeReorderIds(["5", "4", "3", "2", "1"], ["1", "5"], "1"),
      ["1", "5", "4", "3", "2"],
    );
  });
});

describe("mergeReorderIds — degenerate", () => {
  it("empty existing with only the mover in bodyIds", () => {
    assert.deepEqual(mergeReorderIds([], ["10"], "10"), ["10"]);
  });

  it("movingId is the only id in a non-empty existing", () => {
    // User reorders within a day that has a single tx; becomes a no-op.
    assert.deepEqual(mergeReorderIds(["10"], ["10"], "10"), ["10"]);
  });
});

describe("anchorsPreserveOrder", () => {
  it("accepts: anchors already in existing order (cross-day insert)", () => {
    // existing [5..1], bodyIds [5, 10, 3, 1], movingId 10.
    // Anchors (5, 3, 1) match existing's subsequence (5, 3, 1).
    assert.equal(
      anchorsPreserveOrder(
        ["5", "4", "3", "2", "1"],
        ["5", "10", "3", "1"],
        "10",
      ),
      true,
    );
  });

  it("accepts: anchors are all existing, movingId is within-day", () => {
    // Within-day: movingId IS in existing. Anchors = bodyIds minus movingId.
    // existing [3, 2, 1], bodyIds [2, 3, 1], movingId 2 → anchors [3, 1] vs
    // existing-minus-2 [3, 1] → equal.
    assert.equal(
      anchorsPreserveOrder(["3", "2", "1"], ["2", "3", "1"], "2"),
      true,
    );
  });

  it("accepts: no anchors (bodyIds = [movingId] alone)", () => {
    assert.equal(anchorsPreserveOrder(["3", "2", "1"], ["10"], "10"), true);
  });

  it("accepts: empty existing with just the mover", () => {
    assert.equal(anchorsPreserveOrder([], ["10"], "10"), true);
  });

  it("rejects: two existing anchors reordered — [1, 3] (two movements)", () => {
    // existing [3, 2, 1], bodyIds [1, 3], movingId 10 (not in either).
    // Anchors [1, 3] vs existing subsequence [3, 1] → differ.
    assert.equal(
      anchorsPreserveOrder(["3", "2", "1"], ["1", "3"], "10"),
      false,
    );
  });

  it("rejects: an anchor is missing from existing (stale client / wrong date)", () => {
    // existing [3, 2, 1], bodyIds [3, 20, 10], movingId 10 — 20 is unknown.
    assert.equal(
      anchorsPreserveOrder(["3", "2", "1"], ["3", "20", "10"], "10"),
      false,
    );
  });

  it("rejects: bodyIds reorders anchors (2, 3) when movingId is separate", () => {
    // existing [3, 2, 1], bodyIds [2, 10, 3], movingId 10. Anchors [2, 3]
    // vs existing-subseq [3, 2]. Anchor order violated.
    assert.equal(
      anchorsPreserveOrder(["3", "2", "1"], ["2", "10", "3"], "10"),
      false,
    );
  });

  it("rejects: movingId absent from existing AND anchors out of order", () => {
    // Combined violation — just confirms the check catches the order error.
    assert.equal(
      anchorsPreserveOrder(["5", "4", "3", "2", "1"], ["3", "10", "5"], "10"),
      false,
    );
  });

  it("accepts: identity (bodyIds matches existing exactly, movingId arbitrary)", () => {
    // No actual movement; anchors still preserve order trivially.
    assert.equal(
      anchorsPreserveOrder(["3", "2", "1"], ["3", "2", "1"], "2"),
      true,
    );
  });
});
