import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export const CREATE_NEW = "__new__";

/**
 * Controlled group picker with an inline "Create new…" escape hatch.
 * When `value === CREATE_NEW`, renders a text input for the new group name.
 * Parent owns both pieces of state.
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
      <Field label="Group" htmlFor="accountGroupId">
        <NativeSelect
          id="accountGroupId"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          required
        >
          <option value="" disabled>
            Select…
          </option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value={CREATE_NEW}>+ Create new group</option>
        </NativeSelect>
      </Field>
      {creatingNew && (
        <Field label="New group name" htmlFor="newGroupName">
          <Input
            id="newGroupName"
            value={newGroupName}
            onChange={(e) => onNewGroupNameChange(e.target.value)}
            required
            autoFocus
            maxLength={100}
            placeholder="e.g. Investments"
          />
        </Field>
      )}
    </>
  );
}
