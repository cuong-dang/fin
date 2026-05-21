import { ActionIcon, Group, Input, Select } from "@mantine/core";
import { Plus } from "lucide-react";
import { useState } from "react";

import { CreateNameModal } from "./create-name-modal";

/**
 * Tap-only picker for entities that the user might want to create
 * inline (category, subcategory, account group). The label lives on
 * the outer wrapper so the Select's input box and the "+" button form
 * a clean single row underneath — letting them bottom-align via the
 * Select's internal label would leave the button floating above the
 * input. Search is deliberately off; creation goes through a small
 * modal popped by the "+" button (the only path that should ever pop
 * the mobile soft keyboard).
 */
export function PickOrCreate({
  label,
  required = false,
  disabled = false,
  placeholder,
  description,
  data,
  value,
  onChange,
  onCreate,
  modalTitle,
}: {
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  description?: string;
  /** Select options. Use `{ value, label }`; grouped data isn't
   *  supported here — none of the create-flow pickers need it. */
  data: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
  onCreate: (name: string) => void;
  modalTitle: string;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <Input.Wrapper description={description} label={label} required={required}>
      <Group>
        <Select
          aria-label={label}
          data={data}
          disabled={disabled}
          flex={1}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
        <ActionIcon
          aria-label={`Create new ${label.toLowerCase()}`}
          onClick={() => setCreating(true)}
        >
          <Plus size={14} />
        </ActionIcon>
      </Group>
      {creating && (
        <CreateNameModal
          title={modalTitle}
          onCancel={() => setCreating(false)}
          onSubmit={(name) => {
            onCreate(name);
            setCreating(false);
          }}
        />
      )}
    </Input.Wrapper>
  );
}
