import { Link } from "react-router";
import { Button } from "@/components/ui/button";

/** "← Back" link rendered as a subtle link-style button flush to the left edge. */
export function BackLink({
  to,
  children = "← Back",
}: {
  to: string;
  children?: React.ReactNode;
}) {
  return (
    <Button asChild variant="link" size="sm" className="-ml-2.5 px-0">
      <Link to={to}>{children}</Link>
    </Button>
  );
}
