import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { db } from "@/db";
import { accountGroups, accounts } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";
import { updateAccount } from "../../actions";

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return null;

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  if (!account || account.groupId !== session.groupId) notFound();

  const groups = await db
    .select()
    .from(accountGroups)
    .where(eq(accountGroups.groupId, session.groupId))
    .orderBy(accountGroups.name);

  const boundUpdate = updateAccount.bind(null, id);

  return (
    <FormPage>
      <BackLink href="/accounts" />
      <h1 className="mt-4 text-2xl font-semibold">Edit account</h1>
      <form action={boundUpdate} className="mt-6 space-y-4">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            autoFocus
            maxLength={100}
            defaultValue={account.name}
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Input id="currency" defaultValue={account.currency} disabled />
        </Field>
        <Field label="Group" htmlFor="accountGroupId">
          <NativeSelect
            id="accountGroupId"
            name="accountGroupId"
            defaultValue={account.accountGroupId}
            required
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit">Save</Button>
      </form>
    </FormPage>
  );
}
