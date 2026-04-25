import { ActionIcon, Button, Group, Text, TextInput } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";

import { DestructiveIconButton } from "@/components/destructive-icon-button";

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
            flex={1}
            maxLength={100}
            required
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
        <DestructiveIconButton
          confirmMessage={confirmDeleteMessage}
          label={`Delete ${label}`}
          onConfirm={() => del.mutate()}
        />
      </Group>
    </Group>
  );
}
