import { Select } from "@mantine/core";

export type DrillOption = { id: string; label: string };

/**
 * Select dropdown for choosing the next drill target. Caller provides
 * the option list (already filtered to drillable items and mapped to
 * `{id, label}`); on pick, the caller's `onPick` receives the option's
 * id and looks up whatever state segment it represents. Renders null
 * when there's nothing to pick.
 */
export function DrillPicker({
  options,
  onPick,
}: {
  options: DrillOption[];
  onPick: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <Select
      aria-label="Drill into"
      clearable={false}
      data={options.map((o) => ({ value: o.id, label: o.label }))}
      placeholder="Drill into…"
      value={null}
      onChange={(value) => {
        if (value) onPick(value);
      }}
    />
  );
}
