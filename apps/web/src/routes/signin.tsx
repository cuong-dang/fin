import { Button, Stack, Text } from "@mantine/core";
import { Link } from "react-router";

export function SignInRoute() {
  return (
    <Stack align="center" justify="center" h="100%">
      <Text>
        Sign in to fin
      </Text>
      <Button component="a" href="/api/auth/google/start">
        Continue with Google
      </Button>
    </Stack>
  );
}
