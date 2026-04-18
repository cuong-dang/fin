"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";

const updateSchema = z.object({
  timestamp: z.coerce.date(),
  description: z.string().trim().max(500).optional(),
});

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function updateTransaction(id: string, formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = updateSchema.parse({
    timestamp: formData.get("timestamp"),
    description: pick(formData, "description"),
  });

  const [tx] = await db
    .select({ groupId: transactions.groupId })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  if (!tx || tx.groupId !== session.groupId) {
    throw new Error("Transaction not found");
  }

  await db
    .update(transactions)
    .set({
      timestamp: parsed.timestamp,
      description: parsed.description ?? null,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, id));

  redirect("/");
}

export async function deleteTransaction(id: string) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const [tx] = await db
    .select({ groupId: transactions.groupId })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  if (!tx || tx.groupId !== session.groupId) {
    throw new Error("Transaction not found");
  }

  // transaction_legs and transaction_lines both ON DELETE CASCADE, so a
  // single delete here also clears them.
  await db.delete(transactions).where(eq(transactions.id, id));

  revalidatePath("/");
  redirect("/");
}
