import { ActionIcon, Button, Group, Text, TextInput } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

/** Inline-editable name cell with delete. Controlled via callbacks. */
export function EditableName({
  name,
  label,
  confirmDeleteMessage,
  onUpdate,
  onDelete,
  invalidate,
}: {
  name: string;
  label: string;
  confirmDeleteMessage: string;
  onUpdate: (newName: string) => Promise<void>;
  onDelete: () => Promise<void>;
  invalidate: string[][];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const update = useMutation({
    mutationFn: (next: string) => onUpdate(next),
    onSuccess: () => {
      for (const k of invalidate) qc.invalidateQueries({ queryKey: k });
      setEditing(false);
    },
  });
  const del = useMutation({
    mutationFn: onDelete,
    onSuccess: () => {
      for (const k of invalidate) qc.invalidateQueries({ queryKey: k });
    },
    onError: (e) => alert((e as Error).message),
  });

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(draft);
        }}
      >
        <Group gap="xs">
          <TextInput
            data-autofocus
            maxLength={100}
            required
            style={{ flex: 1 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button loading={update.isPending} size="xs" type="submit">
            Save
          </Button>
          <Button
            size="xs"
            type="button"
            variant="subtle"
            onClick={() => {
              setDraft(name);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </Group>
      </form>
    );
  }

  return (
    <Group gap="xs" justify="space-between">
      <Text>{name}</Text>
      <Group gap={0}>
        <ActionIcon
          aria-label={`Edit ${label}`}
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} />
        </ActionIcon>
        <ActionIcon
          aria-label={`Delete ${label}`}
          color="red"
          onClick={() => {
            if (confirm(confirmDeleteMessage)) del.mutate();
          }}
        >
          <Trash2 size={14} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
