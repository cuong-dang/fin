"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const CREATE_NEW = "__new__";

/**
 * Group picker with an inline "Create new…" escape hatch. Selecting the
 * last option reveals a text input; anything else hides it. Server action
 * reads `accountGroupId` (skipped on CREATE_NEW) and `newGroupName`.
 */
export function GroupSelector({
  groups,
  defaultValue = "",
}: {
  groups: Array<{ id: string; name: string }>;
  defaultValue?: string;
}) {
  const [value, setValue] = useState<string>(defaultValue);
  const creatingNew = value === CREATE_NEW;

  return (
    <>
      <Field label="Group" htmlFor="accountGroupId">
        <NativeSelect
          id="accountGroupId"
          // When creating new, don't submit the sentinel as accountGroupId —
          // the server action reads only `newGroupName` in that case.
          name={creatingNew ? undefined : "accountGroupId"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
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
            name="newGroupName"
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
