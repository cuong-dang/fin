import { Anchor } from "@mantine/core";
import { Link } from "react-router";

/** "← Back" link — subtle and flush to the left edge. */
export function BackLink({ to }: { to: string }) {
  return (
    <Anchor c="dimmed" component={Link} size="sm" to={to}>
      ← Back
    </Anchor>
  );
}
