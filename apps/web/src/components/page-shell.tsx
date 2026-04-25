import { Box, Container, Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

import { BackLink } from "./back-link";

/**
 * Standard form-page layout: BackLink + Title (+ optional subtitle / right
 * action) above a vertical Stack of content. Used by every non-AppShell
 * route.
 */
export function PageShell({
  back,
  title,
  subtitle,
  right,
  children,
}: {
  back: string;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Container>
      <Stack>
        <BackLink to={back} />
        <Box>
          <Group justify="space-between">
            <Title order={2}>{title}</Title>
            {right}
          </Group>
          {subtitle && (
            <Text c="dimmed" size="sm">
              {subtitle}
            </Text>
          )}
        </Box>
        {children}
      </Stack>
    </Container>
  );
}
