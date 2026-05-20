import { Container, Group, Stack, Title } from "@mantine/core";
import type { ReactNode } from "react";

import { BackLink } from "./back-link.js";

/**
 * Standard form-page layout: optional BackLink + Title (+ optional
 * right action) above a vertical Stack of content. Used by every
 * non-AppShell route.
 *
 * `withBackLink` defaults to true; set it to false for pages that
 * already expose a Cancel button (the Back link would be redundant
 * and the user could conflate the two — Back navigates away while
 * Cancel may also clear unsaved state).
 */
export function PageShell({
  title,
  children,
  right,
  withBackLink = true,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  withBackLink?: boolean;
}) {
  return (
    <Container size="xs">
      <Stack align="flex-start">
        {withBackLink && <BackLink />}
        <Stack w="100%">
          <Group justify="space-between">
            <Title order={4}>{title}</Title>
            {right}
          </Group>
          {children}
        </Stack>
      </Stack>
    </Container>
  );
}
