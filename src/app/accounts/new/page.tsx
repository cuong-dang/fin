import Link from "next/link";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { accountGroups } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";
import { createAccount } from "./actions";

// A small, curated set. Users can type any ISO 4217 code if they need more.
const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CNY",
  "VND",
  "KRW",
  "INR",
];

const SELECT_CLASS =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 block h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none";

export default async function NewAccountPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const groups = await db
    .select()
    .from(accountGroups)
    .where(eq(accountGroups.groupId, session.groupId))
    .orderBy(accountGroups.name);

  if (groups.length === 0) {
    return (
      <main className="mx-auto max-w-md p-8">
        <Button asChild variant="link" size="sm" className="-ml-2.5 px-0">
          <Link href="/">← Back</Link>
        </Button>
        <h1 className="mt-4 text-2xl font-semibold">New account</h1>
        <p className="text-muted-foreground mt-4 text-sm">
          You need to create an account group first — accounts are always
          organized under a group (e.g. Banks, Credit Cards).
        </p>
        <Button asChild className="mt-6">
          <Link href="/account-groups/new">Create account group</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <Button asChild variant="link" size="sm" className="-ml-2.5 px-0">
        <Link href="/">← Back</Link>
      </Button>
      <h1 className="mt-4 text-2xl font-semibold">New account</h1>
      <form action={createAccount} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            autoFocus
            maxLength={100}
            placeholder="Chase Checking"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            name="currency"
            defaultValue="USD"
            className={SELECT_CLASS}
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accountGroupId">Group</Label>
          <select
            id="accountGroupId"
            name="accountGroupId"
            required
            className={SELECT_CLASS}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted-foreground text-xs">
          Need another group?{" "}
          <Link
            href="/account-groups/new"
            className="hover:text-foreground underline"
          >
            Create one
          </Link>
          .
        </p>
        <Button type="submit">Create account</Button>
      </form>
    </main>
  );
}
