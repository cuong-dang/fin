"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { accountGroups, accounts, transactionLegs } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  accountGroupId: z.uuid(),
});

export async function updateAccount(accountId: string, formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = updateSchema.parse({
    name: formData.get("name"),
    accountGroupId: formData.get("accountGroupId"),
  });

  const [account] = await db
    .select({ groupId: accounts.groupId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account || account.groupId !== session.groupId) {
    throw new Error("Account not found");
  }

  const [targetGroup] = await db
    .select({ groupId: accountGroups.groupId })
    .from(accountGroups)
    .where(eq(accountGroups.id, parsed.accountGroupId))
    .limit(1);
  if (!targetGroup || targetGroup.groupId !== session.groupId) {
    throw new Error("Destination group not found");
  }

  await db
    .update(accounts)
    .set({
      name: parsed.name,
      accountGroupId: parsed.accountGroupId,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));

  redirect("/accounts");
}

export async function deleteAccount(accountId: string) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const [account] = await db
    .select({ groupId: accounts.groupId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account || account.groupId !== session.groupId) {
    throw new Error("Account not found");
  }

  // transaction_legs.account_id is ON DELETE RESTRICT. Check first so we can
  // return a helpful message rather than a raw FK violation.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactionLegs)
    .where(eq(transactionLegs.accountId, accountId));
  if (count > 0) {
    throw new Error(
      `Cannot delete account: ${count} transaction leg(s) reference it`,
    );
  }

  await db.delete(accounts).where(eq(accounts.id, accountId));

  revalidatePath("/");
  revalidatePath("/accounts");
}
