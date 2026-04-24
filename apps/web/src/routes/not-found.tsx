import { Button, Code, Stack, Text, Title } from "@mantine/core";
import { Link, useLocation } from "react-router";

export function NotFoundRoute() {
  const { pathname } = useLocation();
  return (
    <Stack align="center" h="100%" justify="center">
      <Title>Not found</Title>
      <Text>
        <Code>{pathname}</Code> doesn't match any route.
      </Text>
      <Button component={Link} to="/">
        Go home
      </Button>
    </Stack>
  );
}
