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
        data={[
          { value: "", label: "Select…", disabled: true },
          ...groups.map((g) => ({ value: g.id, label: g.name })),
          { value: CREATE_NEW, label: "+ Create new group" },
        ]}
        label="Group"
        required
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
      {creatingNew && (
        <TextInput
          data-autofocus
          label="New group name"
          maxLength={100}
          placeholder="Investments"
          required
          value={newGroupName}
          onChange={(e) => onNewGroupNameChange(e.target.value)}
        />
      )}
    </>
  );
}
