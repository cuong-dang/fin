import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { db } from "@/db";
import { accountGroups, accounts, transactionLegs } from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { formatMoney, formatMoneyPlain } from "@/lib/money";
import { getCurrentSession } from "@/lib/session";
import { updateAccount } from "../../actions";
import { GroupSelector } from "../../group-selector";

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return null;

  const account = await findOwned(accounts, id, session.groupId);
  if (!account) notFound();

  const [groups, [balanceRow]] = await Promise.all([
    db
      .select()
      .from(accountGroups)
      .where(eq(accountGroups.groupId, session.groupId))
      .orderBy(accountGroups.name),
    db
      .select({
        current: sql<string>`COALESCE(SUM(${transactionLegs.amount}), 0)`,
      })
      .from(transactionLegs)
      .where(eq(transactionLegs.accountId, id)),
  ]);
  const currentBalance = BigInt(balanceRow.current);

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
        <GroupSelector groups={groups} defaultValue={account.accountGroupId} />
        <Field label="Balance" htmlFor="balance">
          <MoneyInput
            id="balance"
            name="balance"
            defaultValue={formatMoneyPlain(currentBalance, account.currency)}
          />
          <p className="text-muted-foreground text-xs">
            Current: {formatMoney(currentBalance, account.currency)}. Changing
            this records an adjustment transaction for the delta.
          </p>
        </Field>
        <Button type="submit">Save</Button>
      </form>
    </FormPage>
  );
}
