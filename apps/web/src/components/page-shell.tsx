import { Container, Group, Stack, Text, Title } from "@mantine/core";
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
  /** Either a destination URL (string) or a callback (typically
   *  `() => navigate(-1)` to go back in history). */
  back: string | (() => void);
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Container>
      <Stack>
        {typeof back === "string" ? (
          <BackLink to={back} />
        ) : (
          <BackLink onClick={back} />
        )}
        <Stack>
          <Group justify="space-between">
            <Title order={2}>{title}</Title>
            {right}
          </Group>
          {subtitle && <Text c="dimmed">{subtitle}</Text>}
        </Stack>
        {children}
      </Stack>
    </Container>
  );
}
