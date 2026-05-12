import { Box, Divider, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * Bottom-of-page "Danger zone" frame: heading + dimmed description above
 * caller-supplied action buttons. The frame is shared; the buttons differ
 * per page (transaction: delete only; bill: cancel/resume + delete).
 */
export function DangerZone({
  description,
  children,
}: {
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box mt="md">
      <Divider />
      <Stack>
        <Text fw={600}>Danger zone</Text>
        <Text c="dimmed">{description}</Text>
        {children}
      </Stack>
    </Box>
  );
}
