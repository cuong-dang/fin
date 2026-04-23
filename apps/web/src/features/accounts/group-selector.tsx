import { NativeSelect, TextInput } from "@mantine/core";

export const CREATE_NEW = "__new__";

/**
 * Controlled group picker with an inline "Create new…" escape hatch.
 * When `value === CREATE_NEW`, renders a text input for the new group name.
 */
export function GroupSelector({
  groups,
  value,
  onValueChange,
  newGroupName,
  onNewGroupNameChange,
}: {
  groups: Array<{ id: string; name: string }>;
  value: string;
  onValueChange: (v: string) => void;
  newGroupName: string;
  onNewGroupNameChange: (v: string) => void;
}) {
  const creatingNew = value === CREATE_NEW;
  return (
    <>
      <NativeSelect
        label="Group"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        required
        data={[
          { value: "", label: "Select…", disabled: true },
          ...groups.map((g) => ({ value: g.id, label: g.name })),
          { value: CREATE_NEW, label: "+ Create new group" },
        ]}
      />
      {creatingNew && (
        <TextInput
          label="New group name"
          value={newGroupName}
          onChange={(e) => onNewGroupNameChange(e.target.value)}
          required
          data-autofocus
          maxLength={100}
          placeholder="e.g. Investments"
        />
      )}
    </>
  );
}
