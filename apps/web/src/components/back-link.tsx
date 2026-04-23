import { Anchor } from "@mantine/core";
import { Link } from "react-router";

/** "← Back" link — subtle and flush to the left edge. */
export function BackLink({ to }: { to: string }) {
  return (
    <Anchor component={Link} to={to} size="sm" c="dimmed">
      ← Back
    </Anchor>
  );
}
