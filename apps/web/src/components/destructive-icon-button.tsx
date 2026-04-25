import { ActionIcon } from "@mantine/core";
import { Trash2 } from "lucide-react";

/**
 * Red trash ActionIcon that triggers a `window.confirm` before invoking
 * `onConfirm`. `label` is required (becomes the aria-label).
 */
export function DestructiveIconButton({
  label,
  confirmMessage,
  onConfirm,
}: {
  label: string;
  confirmMessage: string;
  onConfirm: () => void;
}) {
  return (
    <ActionIcon
      aria-label={label}
      color="red"
      onClick={() => {
        if (confirm(confirmMessage)) onConfirm();
      }}
    >
      <Trash2 size={14} />
    </ActionIcon>
  );
}
