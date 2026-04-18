import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createAccountGroup } from "./actions";

export default function NewAccountGroupPage() {
  return (
    <FormPage>
      <BackLink href="/" />
      <h1 className="mt-4 text-2xl font-semibold">New account group</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        A container to cluster related accounts (e.g. Banks, Credit Cards,
        Investments).
      </p>
      <form action={createAccountGroup} className="mt-6 space-y-4">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            autoFocus
            maxLength={100}
            placeholder="Banks"
          />
        </Field>
        <Button type="submit">Create</Button>
      </form>
    </FormPage>
  );
}
