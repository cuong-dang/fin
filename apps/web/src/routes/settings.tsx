import { NavLink } from "@mantine/core";
import { Link } from "react-router";

import { PageShell } from "@/components/page-shell";

export function SettingsRoute() {
  return (
    <PageShell back="/" title="Settings">
      <NavLink
        component={Link}
        description="Categories, subcategories, and tags"
        label="Categories & tags"
        to="/settings/categories"
      />
    </PageShell>
  );
}
