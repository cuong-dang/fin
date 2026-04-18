import { signOut } from "@/auth";

export function SignOutForm() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      <button className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        Sign out
      </button>
    </form>
  );
}
