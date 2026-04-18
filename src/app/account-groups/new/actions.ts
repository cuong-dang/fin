"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { accountGroups } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function createAccountGroup(formData: FormData) {
  const session = await getCurrentSession();
  if (!session?.groupId) throw new Error("No active group");

  const parsed = schema.parse({ name: formData.get("name") });

  await db
    .insert(accountGroups)
    .values({ groupId: session.groupId, name: parsed.name });

  redirect("/accounts/new");
}
