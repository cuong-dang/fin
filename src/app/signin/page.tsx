import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in to fin</h1>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
