import Link from "next/link";
import { Button } from "@/components/ui/button";

/** "← Back" link rendered as a subtle link-style button flush to the left edge. */
export function BackLink({
  href,
  children = "← Back",
}: {
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <Button asChild variant="link" size="sm" className="-ml-2.5 px-0">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
