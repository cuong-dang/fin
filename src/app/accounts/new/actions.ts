"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase()),
  accountGroupId: z.uuid(),
});

export async function createAccount(formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = schema.parse({
    name: formData.get("name"),
    currency: formData.get("currency"),
    accountGroupId: formData.get("accountGroupId"),
  });

  await db.insert(accounts).values({
    groupId: session.groupId,
    accountGroupId: parsed.accountGroupId,
    name: parsed.name,
    currency: parsed.currency,
  });

  redirect("/");
}
