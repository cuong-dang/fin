"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { DATE_RE, todayUTCDate } from "@/lib/dates";
import { getCurrentSession } from "@/lib/session";

const markProcessedSchema = z.object({
  date: z.string().regex(DATE_RE, "Expected YYYY-MM-DD").optional(),
});

/**
 * Flip a pending transaction to completed by setting its date. Expects the
 * client to submit today's date (via <LocalTodayInput>); falls back to the
 * server's UTC today if absent.
 */
export async function markTransactionProcessed(id: string, formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = markProcessedSchema.parse({
    date: formData.get("date") || undefined,
  });

  const tx = await findOwned(transactions, id, session.groupId);
  if (!tx) throw new Error("Transaction not found");
  if (tx.date !== null) {
    throw new Error("Transaction is already processed");
  }

  await db
    .update(transactions)
    .set({ date: parsed.date ?? todayUTCDate(), updatedAt: new Date() })
    .where(eq(transactions.id, id));

  // TODO: replace manual path invalidation with revalidateTag("transactions")
  // or similar once we grow more pages that reference this data.
  revalidatePath("/");
}
