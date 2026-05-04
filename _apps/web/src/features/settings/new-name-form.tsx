import { Button, Group, TextInput } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/** Inline "add" form for name-only entities (controlled input that resets). */
export function NewNameForm({
  placeholder,
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
      <Group>
        <TextInput
          flex={1}
          maxLength={100}
          placeholder={placeholder}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={trimmed.length === 0}
          loading={m.isPending}
          type="submit"
        >
          Add
        </Button>
      </Group>
    </form>
  );
}
