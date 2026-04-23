import { Anchor } from "@mantine/core";
import { Link } from "react-router";

/** "← Back" link — subtle and flush to the left edge. */
export function BackLink({
  to,
  children = "← Back",
}: {
  to: string;
  children?: React.ReactNode;
}) {
  return (
    <Anchor component={Link} to={to} size="sm" c="dimmed">
      {children}
    </Anchor>
  );
}
