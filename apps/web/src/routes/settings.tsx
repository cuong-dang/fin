import { NavLink } from "@mantine/core";
import { Link } from "react-router";

import { PageShell } from "@/components/page-shell";

export function SettingsRoute() {
  return (
    <PageShell back="/" title="Settings">
      <NavLink
        component={Link}
        description="Income & expense categories and subcategories"
        label="Categories"
        to="/settings/categories"
      />
    </PageShell>
  );
}
