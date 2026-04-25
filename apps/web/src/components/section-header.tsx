import { Text } from "@mantine/core";

/**
 * Uppercase, dimmed bold label used to mark sections in lists and forms.
 * `compact` drops to "xs" for tight list contexts (date headers, line markers).
 */
export function SectionHeader({
  children,
  compact,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Text c="dimmed" fw={700} size={compact ? "xs" : "sm"} tt="uppercase">
      {children}
    </Text>
  );
}
