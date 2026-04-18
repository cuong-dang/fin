import Link from "next/link";
import { Plus, X } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";

/**
 * Header shown above the transactions list on the home page.
 * Title shows the filtered account name (if any) or a generic label, with
 * an inline × to clear the filter when active.
 */
export function TransactionsPageHeader({
  accountName,
}: {
  accountName: string | undefined;
}) {
  return (
    <PageHeader>
      <div className="flex items-center gap-1.5">
        <h1 className="text-lg font-semibold">
          {accountName ?? "All transactions"}
        </h1>
        {accountName && (
          <Button
            asChild
            variant="ghost"
            size="icon-xs"
            aria-label="Clear filter"
          >
            <Link href="/">
              <X />
            </Link>
          </Button>
        )}
      </div>
      <Button asChild size="sm">
        <Link href="/transactions/new">
          <Plus />
          New transaction
        </Link>
      </Button>
    </PageHeader>
  );
}
