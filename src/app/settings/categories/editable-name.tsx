"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Inline-editable name cell with delete. Starts in display mode; clicking the
 * pencil swaps in a small form with Save/Cancel. The update action must close
 * edit mode by revalidating the page or returning after awaiting.
 */
export function EditableName({
  name,
  updateAction,
  deleteAction,
  confirmDeleteMessage,
  label,
}: {
  name: string;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: () => Promise<void>;
  confirmDeleteMessage: string;
  label: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={async (fd) => {
          await updateAction(fd);
          setEditing(false);
        }}
        className="flex flex-1 items-center gap-2"
      >
        <Input
          name="name"
          defaultValue={name}
          autoFocus
          required
          maxLength={100}
          className="flex-1"
        />
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
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
        <ConfirmDeleteButton
          action={deleteAction}
          confirmMessage={confirmDeleteMessage}
          label={`Delete ${label}`}
          iconOnly
        />
      </div>
    </div>
  );
}
