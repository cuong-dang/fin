import {
  Button,
  Checkbox,
  Combobox,
  Group,
  InputBase,
  Text,
  useCombobox,
} from "@mantine/core";

type Option = { value: string; label: string };

/**
 * Multi-select dropdown that shows a one-line summary instead of
 * pills. Click the trigger to open a list of options with checkboxes;
 * clicking an option toggles its membership.
 *
 * State model mirrors the existing chart filters: `value === null`
 * means "uninitialized" (display the `allLabel` placeholder, treat
 * every option as effectively selected). An explicit array — even
 * one matching every option — replaces that. Empty array = "none
 * selected" (intentional filter that excludes everything).
 *
 * Built on Mantine's `Combobox` primitive because the prebuilt
 * `MultiSelect` is pill-based; the checklist pattern needs custom
 * target + option content.
 */
export function MultiSelectChecklist({
  options,
  value,
  onChange,
  allLabel,
  ariaLabel,
  miw = 200,
}: {
  options: Option[];
  /** null = uninitialized (all-selected placeholder). */
  value: string[] | null;
  onChange: (next: string[]) => void;
  /** Placeholder shown when nothing's been touched or every option
   *  is selected (e.g., "All groups", "All tags"). */
  allLabel: string;
  ariaLabel: string;
  miw?: number;
}) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const allValues = options.map((o) => o.value);
  // Treat null AND the array-form of "every option selected" as the
  // same logical state — lets the user deselect and re-select all
  // options and have the placeholder come back.
  const effectiveSelected = value ?? allValues;
  const isAllSelected =
    effectiveSelected.length === allValues.length &&
    allValues.every((v) => effectiveSelected.includes(v));

  const displayed = (() => {
    if (isAllSelected) return allLabel;
    if (effectiveSelected.length === 0) return "None selected";
    if (effectiveSelected.length === 1) {
      const v = effectiveSelected[0]!;
      return options.find((o) => o.value === v)?.label ?? "1 selected";
    }
    return `${effectiveSelected.length} selected`;
  })();

  const toggle = (v: string) => {
    const curr = value ?? allValues;
    onChange(curr.includes(v) ? curr.filter((x) => x !== v) : [...curr, v]);
  };

  return (
    <Combobox store={combobox} onOptionSubmit={toggle}>
      <Combobox.Target>
        <InputBase
          aria-label={ariaLabel}
          component="button"
          miw={miw}
          pointer
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          type="button"
          onClick={() => combobox.toggleDropdown()}
        >
          {isAllSelected || effectiveSelected.length === 0 ? (
            <Text c="dimmed">{displayed}</Text>
          ) : (
            <Text>{displayed}</Text>
          )}
        </InputBase>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {options.map((o) => {
            const checked = effectiveSelected.includes(o.value);
            return (
              <Combobox.Option key={o.value} active={checked} value={o.value}>
                <Group wrap="nowrap">
                  <Checkbox
                    aria-hidden
                    checked={checked}
                    readOnly
                    tabIndex={-1}
                  />
                  <Text>{o.label}</Text>
                </Group>
              </Combobox.Option>
            );
          })}
        </Combobox.Options>
        {/* Bulk actions. Outside `<Combobox.Options>` so they aren't
            keyboard-navigable as options — they're not selections,
            they replace the whole selection in one shot. */}
        <Combobox.Footer>
          <Group justify="space-between">
            <Button
              disabled={isAllSelected}
              size="compact-xs"
              variant="subtle"
              onClick={() => onChange(allValues)}
            >
              Select all
            </Button>
            <Button
              disabled={effectiveSelected.length === 0}
              size="compact-xs"
              variant="subtle"
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          </Group>
        </Combobox.Footer>
      </Combobox.Dropdown>
    </Combobox>
  );
}
