import { Button } from "@/components/ui/button";

export function SignInRoute() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in to fin</h1>
      <Button asChild>
        <a href="/api/auth/google/start">Continue with Google</a>
      </Button>
    </main>
  );
}
