"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Renders a destructive "Delete" button inside a form. On submit, triggers
 * window.confirm(); if the user cancels, the submission is aborted. Pair
 * with a server action bound with the target entity's id.
 */
export function ConfirmDeleteButton({
  action,
  confirmMessage,
  label = "Delete",
  iconOnly = false,
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  label?: string;
  iconOnly?: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <Button
        type="submit"
        variant="destructive"
        size={iconOnly ? "icon-xs" : "sm"}
        aria-label={iconOnly ? label : undefined}
      >
        {iconOnly ? <Trash2 /> : label}
      </Button>
    </form>
  );
}
