import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useState } from "react";

/**
 * Small one-field modal for the explicit-create flow on category,
 * subcategory, tag, and account-group fields. The TextInput
 * auto-focuses — this is the one path where popping the mobile soft
 * keyboard is the right thing, since the user explicitly opted into
 * creation by tapping a "+" button.
 */
export function CreateNameModal({
  title,
  onSubmit,
  onCancel,
}: {
  title: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const submit = () => trimmed && onSubmit(trimmed);
  return (
    <Modal centered opened title={title} onClose={onCancel}>
      <Stack>
        <TextInput
          autoFocus
          data-autofocus
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Group justify="flex-end">
          <Button disabled={!trimmed} type="button" onClick={submit}>
            Create
          </Button>
          <Button type="button" variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
