import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  /** Query keys to invalidate after update/delete. */
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
        className="flex flex-1 items-center gap-2"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          required
          maxLength={100}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={update.isPending}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(name);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-between gap-2">
      <span>{name}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label}`}
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon-xs"
          aria-label={`Delete ${label}`}
          onClick={() => {
            if (confirm(confirmDeleteMessage)) del.mutate();
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
