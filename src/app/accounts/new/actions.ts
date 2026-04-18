"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { accountGroups, accounts } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase()),
  accountGroupId: z.uuid().optional(),
  newGroupName: z.string().trim().min(1).max(100).optional(),
});

function emptyToUndef(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function createAccount(formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = schema.parse({
    name: formData.get("name"),
    currency: formData.get("currency"),
    accountGroupId: emptyToUndef(formData.get("accountGroupId")),
    newGroupName: emptyToUndef(formData.get("newGroupName")),
  });

  // A new group name, if typed, wins over a picked existing group — you
  // probably meant the thing you just typed.
  if (!parsed.accountGroupId && !parsed.newGroupName) {
    throw new Error("Select an existing group or name a new one");
  }

  await db.transaction(async (tx) => {
    let accountGroupId = parsed.accountGroupId;
    if (parsed.newGroupName) {
      const [row] = await tx
        .insert(accountGroups)
        .values({ groupId: session.groupId, name: parsed.newGroupName })
        .returning({ id: accountGroups.id });
      accountGroupId = row.id;
    }
    await tx.insert(accounts).values({
      groupId: session.groupId,
      accountGroupId: accountGroupId!,
      name: parsed.name,
      currency: parsed.currency,
    });
  });

  redirect("/");
}
