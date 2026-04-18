import Link from "next/link";
import { createAccountGroup } from "./actions";

export default function NewAccountGroupPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← Back
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">New account group</h1>
      <p className="mt-1 text-sm text-zinc-500">
        A container to cluster related accounts (e.g. Banks, Credit Cards,
        Investments).
      </p>
      <form action={createAccountGroup} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            required
            autoFocus
            maxLength={100}
            placeholder="Banks"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Create
        </button>
      </form>
    </main>
  );
}
