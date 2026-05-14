import { Group, Title, Tooltip } from "@mantine/core";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Chart header: title + dimmed info icon. Hovering the icon shows
 * `info` in a multi-line tooltip describing the chart's purpose,
 * filters, and exclusions.
 */
export function ChartTitle({
  title,
  info,
}: {
  title: string;
  info: ReactNode;
}) {
  return (
    <Group>
      <Title order={4}>{title}</Title>
      <Tooltip label={info} multiline w={300}>
        <Info color="var(--mantine-color-dimmed)" size={14} />
      </Tooltip>
    </Group>
  );
}
