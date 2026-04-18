import Link from "next/link";
import { Pencil } from "lucide-react";
import { eq } from "drizzle-orm";
import { BackLink } from "@/components/back-link";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { accountGroups, accounts } from "@/db/schema";
import { groupBy } from "@/lib/collections";
import { getCurrentSession } from "@/lib/session";
import { deleteAccountGroup } from "../account-groups/actions";
import { deleteAccount } from "./actions";

type AccountRow = {
  id: string;
  name: string;
  currency: string;
  accountGroupId: string;
};

export default async function AccountsManagePage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const [groups, accountsRows] = await Promise.all([
    db
      .select()
      .from(accountGroups)
      .where(eq(accountGroups.groupId, session.groupId))
      .orderBy(accountGroups.name),
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        currency: accounts.currency,
        accountGroupId: accounts.accountGroupId,
      })
      .from(accounts)
      .where(eq(accounts.groupId, session.groupId))
      .orderBy(accounts.name),
  ]);

  const byGroup = groupBy(accountsRows, (a) => a.accountGroupId);

  return (
    <FormPage size="lg">
      <BackLink href="/" />
      <div className="mt-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Manage accounts</h1>
        <Button asChild size="sm">
          <Link href="/accounts/new">New account</Link>
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">
          No account groups yet.{" "}
          <Link
            href="/accounts/new"
            className="hover:text-foreground underline"
          >
            Create your first account
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              accounts={byGroup.get(g.id) ?? []}
            />
          ))}
        </div>
      )}
    </FormPage>
  );
}

function GroupSection({
  group,
  accounts,
}: {
  group: { id: string; name: string };
  accounts: AccountRow[];
}) {
  const boundDelete = deleteAccountGroup.bind(null, group.id);
  return (
    <section>
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-sm font-semibold tracking-wider uppercase">
          {group.name}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit group ${group.name}`}
          >
            <Link href={`/account-groups/${group.id}/edit`}>
              <Pencil />
            </Link>
          </Button>
          <ConfirmDeleteButton
            action={boundDelete}
            confirmMessage={`Delete group "${group.name}"? This cannot be undone.`}
            label={`Delete group ${group.name}`}
            iconOnly
          />
        </div>
      </div>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm italic">
          No accounts.
        </p>
      ) : (
        <ul className="mt-2 divide-y">
          {accounts.map((a) => (
            <AccountRowItem key={a.id} account={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountRowItem({ account }: { account: AccountRow }) {
  const boundDelete = deleteAccount.bind(null, account.id);
  return (
    <li className="flex items-center justify-between py-2">
      <div className="text-sm">
        <span className="font-medium">{account.name}</span>
        <span className="text-muted-foreground ml-2">{account.currency}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          asChild
          variant="ghost"
          size="icon-xs"
          aria-label={`Edit account ${account.name}`}
        >
          <Link href={`/accounts/${account.id}/edit`}>
            <Pencil />
          </Link>
        </Button>
        <ConfirmDeleteButton
          action={boundDelete}
          confirmMessage={`Delete account "${account.name}"? This cannot be undone.`}
          label={`Delete account ${account.name}`}
          iconOnly
        />
      </div>
    </li>
  );
}
