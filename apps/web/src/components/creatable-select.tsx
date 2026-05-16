import { Combobox, InputBase, useCombobox } from "@mantine/core";

/**
 * Search-as-you-type combobox with a "+ Create '…'" entry that appears
 * when the typed text doesn't match any existing option (case
 * insensitive). Clicking either an existing option or the create entry
 * resolves to the same string — "what the user wants this slot to
 * say." The caller decides whether that string is a select or a create
 * by checking it against its own data list.
 */
export function CreatableSelect({
  data,
  value,
  onChange,
  label,
  placeholder,
  description,
  required = false,
}: {
  data: string[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
}) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const trimmed = value.trim();
  const filtered =
    trimmed.length === 0
      ? data
      : data.filter((d) => d.toLowerCase().includes(trimmed.toLowerCase()));
  const exactMatch =
    trimmed.length > 0 &&
    data.some((d) => d.toLowerCase() === trimmed.toLowerCase());
  const showCreate = !exactMatch && trimmed.length > 0;

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(val) => {
        onChange(val);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          description={description}
          label={label}
          placeholder={placeholder}
          required={required}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          value={value}
          onBlur={() => combobox.closeDropdown()}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            combobox.openDropdown();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {filtered.map((d) => (
            <Combobox.Option key={d} value={d}>
              {d}
            </Combobox.Option>
          ))}
          {showCreate && (
            <Combobox.Option c="dimmed" value={trimmed}>
              + Create &ldquo;{trimmed}&rdquo;
            </Combobox.Option>
          )}
          {!showCreate && filtered.length === 0 && (
            <Combobox.Empty>No options</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
