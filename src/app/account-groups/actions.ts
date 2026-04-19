"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { accountGroups, accounts } from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { getCurrentSession } from "@/lib/session";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function updateAccountGroup(id: string, formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = updateSchema.parse({ name: formData.get("name") });

  const group = await findOwned(accountGroups, id, session.groupId);
  if (!group) throw new Error("Group not found");

  await db
    .update(accountGroups)
    .set({ name: parsed.name, updatedAt: new Date() })
    .where(eq(accountGroups.id, id));

  redirect("/accounts");
}

export async function deleteAccountGroup(id: string) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const group = await findOwned(accountGroups, id, session.groupId);
  if (!group) throw new Error("Group not found");

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

  // TODO: replace manual path invalidation with revalidateTag("accounts") or
  // similar once we grow more pages that reference this data.
  revalidatePath("/");
  revalidatePath("/accounts");
}
