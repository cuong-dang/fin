import Link from "next/link";
import { eq } from "drizzle-orm";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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
      <FormPage>
        <BackLink href="/" />
        <h1 className="mt-4 text-2xl font-semibold">New account</h1>
        <p className="text-muted-foreground mt-4 text-sm">
          You need to create an account group first — accounts are always
          organized under a group (e.g. Banks, Credit Cards).
        </p>
        <Button asChild className="mt-6">
          <Link href="/account-groups/new">Create account group</Link>
        </Button>
      </FormPage>
    );
  }

  return (
    <FormPage>
      <BackLink href="/" />
      <h1 className="mt-4 text-2xl font-semibold">New account</h1>
      <form action={createAccount} className="mt-6 space-y-4">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            autoFocus
            maxLength={100}
            placeholder="Chase Checking"
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <NativeSelect id="currency" name="currency" defaultValue="USD">
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Group" htmlFor="accountGroupId">
          <NativeSelect id="accountGroupId" name="accountGroupId" required>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
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
    </FormPage>
  );
}
