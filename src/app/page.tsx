import { signOut } from "@/auth";
import { getCurrentSession } from "@/lib/session";

export default async function Home() {
  const session = await getCurrentSession();
  if (!session) return null; // proxy should have redirected already

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">fin</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Sign out
          </button>
        </form>
      </div>
      <div className="mt-8 space-y-2 text-sm">
        <p>
          <span className="text-zinc-500">Signed in as:</span> {session.name} (
          {session.email})
        </p>
        <p>
          <span className="text-zinc-500">Group:</span>{" "}
          {session.groupId ?? "(none)"}
        </p>
      </div>
    </main>
  );
}
