import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { accountGroups } from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { getCurrentSession } from "@/lib/session";
import { updateAccountGroup } from "../../actions";

export default async function EditAccountGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return null;

  const group = await findOwned(accountGroups, id, session.groupId);
  if (!group) notFound();

  const boundUpdate = updateAccountGroup.bind(null, id);

  return (
    <FormPage>
      <BackLink href="/accounts" />
      <h1 className="mt-4 text-2xl font-semibold">Edit account group</h1>
      <form action={boundUpdate} className="mt-6 space-y-4">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            autoFocus
            maxLength={100}
            defaultValue={group.name}
          />
        </Field>
        <Button type="submit">Save</Button>
      </form>
    </FormPage>
  );
}
