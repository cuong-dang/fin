import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccountGroup } from "./actions";

export default function NewAccountGroupPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <Button asChild variant="link" size="sm" className="-ml-2.5 px-0">
        <Link href="/">← Back</Link>
      </Button>
      <h1 className="mt-4 text-2xl font-semibold">New account group</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        A container to cluster related accounts (e.g. Banks, Credit Cards,
        Investments).
      </p>
      <form action={createAccountGroup} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            autoFocus
            maxLength={100}
            placeholder="Banks"
          />
        </div>
        <Button type="submit">Create</Button>
      </form>
    </main>
  );
}
