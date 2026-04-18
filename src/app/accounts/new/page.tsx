import Link from "next/link";
import { eq } from "drizzle-orm";
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
  if (!session?.groupId) return null;

  const groups = await db
    .select()
    .from(accountGroups)
    .where(eq(accountGroups.groupId, session.groupId))
    .orderBy(accountGroups.name);

  if (groups.length === 0) {
    return (
      <main className="mx-auto max-w-md p-8">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Back
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">New account</h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          You need to create an account group first — accounts are always
          organized under a group (e.g. Banks, Credit Cards).
        </p>
        <Link
          href="/account-groups/new"
          className="mt-6 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Create account group
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← Back
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">New account</h1>
      <form action={createAccount} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            required
            autoFocus
            maxLength={100}
            placeholder="Chase Checking"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Currency</span>
          <select
            name="currency"
            defaultValue="USD"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Group</span>
          <select
            name="accountGroupId"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-zinc-500">
          Need another group?{" "}
          <Link
            href="/account-groups/new"
            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Create one
          </Link>
          .
        </p>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Create account
        </button>
      </form>
    </main>
  );
}
