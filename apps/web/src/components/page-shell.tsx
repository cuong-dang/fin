import { Container, Group, Stack, Title } from "@mantine/core";
import type { ReactNode } from "react";

import { BackLink } from "./back-link.js";

/**
 * Standard form-page layout: BackLink + Title (+ optional subtitle / right
 * action) above a vertical Stack of content. Used by every non-AppShell
 * route.
 */
export function PageShell({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Container size="xs">
      <Stack align="flex-start">
        <BackLink />
        <Stack w="100%">
          <Group justify="space-between">
            <Title order={3}>{title}</Title>
            {right}
          </Group>
          {children}
        </Stack>
      </Stack>
    </Container>
  );
}
