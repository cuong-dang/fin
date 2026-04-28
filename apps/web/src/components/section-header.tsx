import { Text } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * Uppercase, dimmed bold label used to mark sections in lists and forms.
 * `compact` drops to "xs" for tight list contexts (date headers, line markers).
 */
export function SectionHeader({
  children,
  compact,
  px,
}: {
  children: ReactNode;
  compact?: boolean;
  px?: boolean;
}) {
  return (
    <Text
      c="dimmed"
      fw={600}
      px={px ? "xs" : 0}
      size={compact ? "xs" : "sm"}
      tt="uppercase"
    >
      {children}
    </Text>
  );
}
