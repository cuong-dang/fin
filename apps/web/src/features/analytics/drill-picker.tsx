import type { ChartItem } from "@fin/schemas";
import { Select } from "@mantine/core";

import {
  type ChartState,
  displayItemName,
  type DrillSegment,
  interpretItem,
} from "./cash-flow-state";

/**
 * Select dropdown for choosing the next drill target. Options come
 * from the current chart response's `items` array, filtered to those
 * that produce a valid `DrillSegment` (drops null-id "Other" buckets
 * and any items unrecognized at this drill level).
 *
 * Hidden by the parent when the state is at a leaf (no more drilling
 * available) or the items list is empty.
 */
export function DrillPicker({
  state,
  items,
  onPick,
}: {
  state: ChartState;
  items: ChartItem[];
  onPick: (seg: DrillSegment) => void;
}) {
  // Pair each drillable item with the segment it produces; non-drillable
  // items drop out.
  const options = items
    .map((item) => {
      const seg = interpretItem(state, item);
      if (!seg) return null;
      return { item, seg, label: displayItemName(state, item) };
    })
    .filter(
      (x): x is { item: ChartItem; seg: DrillSegment; label: string } =>
        x !== null,
    );

  if (options.length === 0) return null;

  return (
    <Select
      aria-label="Drill into"
      clearable={false}
      data={options.map((o) => ({
        // Item ids are unique within one response (categories, bills,
        // loans, etc. all have distinct UUIDs; enum ids like "expense"
        // are globally unique within their level).
        value: String(o.item.id),
        label: o.label,
      }))}
      placeholder="Drill into…"
      searchable
      value={null}
      // Reset to null after each pick so the placeholder text returns.
      onChange={(value) => {
        if (!value) return;
        const hit = options.find((o) => String(o.item.id) === value);
        if (hit) onPick(hit.seg);
      }}
    />
  );
}
