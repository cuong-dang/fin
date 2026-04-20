import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      className="flex items-center gap-2"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        maxLength={100}
        required
        className="flex-1"
      />
      <Button
        type="submit"
        size="sm"
        disabled={m.isPending || trimmed.length === 0}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
