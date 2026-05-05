import { Button, Stack, Text } from "@mantine/core";

export function SignInRoute() {
  return (
    <Stack align="center" h="100%" justify="center">
      <Text>Sign in to fin</Text>
      <Button component="a" href="/api/auth/google/start">
        Continue with Google
      </Button>
    </Stack>
  );
}
