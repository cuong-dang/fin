import { PageShell } from "@/components/page-shell.js";

import { NavLink } from "@mantine/core";
import { Link } from "react-router";

export function SettingsRoute() {
  return (
    <PageShell title="Settings">
      <NavLink
        component={Link}
        description="Manage accounts and account groups, archive paid-off loans"
        label="Accounts"
        to="/settings/accounts"
      />
      <NavLink
        component={Link}
        description="Categories, subcategories, and tags"
        label="Categories & tags"
        to="/settings/categories"
      />
      <NavLink
        component={Link}
        description="Recurring charges — utilities, subscriptions, taxes & fees"
        label="Bills"
        to="/settings/bills"
      />
    </PageShell>
  );
}
