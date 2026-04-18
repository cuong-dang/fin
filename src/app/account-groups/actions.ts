"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { accountGroups, accounts } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function updateAccountGroup(id: string, formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = updateSchema.parse({ name: formData.get("name") });

  const [group] = await db
    .select({ groupId: accountGroups.groupId })
    .from(accountGroups)
    .where(eq(accountGroups.id, id))
    .limit(1);
  if (!group || group.groupId !== session.groupId) {
    throw new Error("Group not found");
  }

  await db
    .update(accountGroups)
    .set({ name: parsed.name, updatedAt: new Date() })
    .where(eq(accountGroups.id, id));

  redirect("/accounts");
}

export async function deleteAccountGroup(id: string) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const [group] = await db
    .select({ groupId: accountGroups.groupId })
    .from(accountGroups)
    .where(eq(accountGroups.id, id))
    .limit(1);
  if (!group || group.groupId !== session.groupId) {
    throw new Error("Group not found");
  }

  // accounts.account_group_id is ON DELETE RESTRICT.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(accounts)
    .where(eq(accounts.accountGroupId, id));
  if (count > 0) {
    throw new Error(
      `Cannot delete group: ${count} account(s) still reference it`,
    );
  }

  await db.delete(accountGroups).where(eq(accountGroups.id, id));

  revalidatePath("/");
  revalidatePath("/accounts");
}
