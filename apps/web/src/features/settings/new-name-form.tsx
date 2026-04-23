import { Button, Group, TextInput } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/** Inline "add" form for name-only entities (controlled input that resets). */
export function NewNameForm({
  placeholder,
  submitLabel = "Add",
  onSubmit,
  invalidate,
}: {
  placeholder: string;
  submitLabel?: string;
  onSubmit: (name: string) => Promise<unknown>;
  invalidate: string[][];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: (v: string) => onSubmit(v),
    onSuccess: () => {
      for (const k of invalidate) qc.invalidateQueries({ queryKey: k });
      setName("");
    },
  });
  const trimmed = name.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate(trimmed);
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          maxLength={100}
          required
          style={{ flex: 1 }}
        />
        <Button
          type="submit"
          size="sm"
          loading={m.isPending}
          disabled={trimmed.length === 0}
        >
          {submitLabel}
        </Button>
      </Group>
    </form>
  );
}
