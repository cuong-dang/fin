import { Container, NavLink, Stack, Title } from "@mantine/core";
import { Link } from "react-router";
import { BackLink } from "@/components/back-link";

export function SettingsRoute() {
  return (
    <Container size="sm" p="sm">
      <Stack>
        <BackLink to="/" />
        <Title order={2}>Settings</Title>
        <NavLink
          component={Link}
          to="/settings/categories"
          label="Categories"
          description="Income & expense categories and subcategories"
        />
      </Stack>
    </Container>
  );
}
