import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export function SignOutForm() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      <Button variant="ghost" size="xs" type="submit">
        Sign out
      </Button>
    </form>
  );
}
