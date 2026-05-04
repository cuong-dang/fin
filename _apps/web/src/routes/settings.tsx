import { PageShell } from "@/components/page-shell";

import { NavLink } from "@mantine/core";
import { Link } from "react-router";

export function SettingsRoute() {
  return (
    <PageShell back="/" title="Settings">
      <NavLink
        component={Link}
        description="Manage accounts and account groups, archive paid-off loans"
        label="Accounts"
        to="/accounts"
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
