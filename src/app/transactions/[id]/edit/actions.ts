"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  accounts,
  transactionLegs,
  transactionLines,
  transactions,
} from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { parseMoney } from "@/lib/money";
import { getCurrentSession } from "@/lib/session";
import {
  DATE_RE,
  insertLegsAndLines,
  parseTransactionFormData,
  pick,
} from "../../shared";

const adjustmentSchema = z.object({
  date: z.string().regex(DATE_RE, "Expected YYYY-MM-DD"),
  amount: z.string().trim().min(1),
  description: z.string().trim().max(500).optional(),
});

/**
 * Full rewrite update for income / expense / transfer. Preserves id +
 * createdAt (so URLs and ordering ties are stable); everything else —
 * base fields, legs, and lines — is replaced.
 */
export async function updateTransaction(id: string, formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = parseTransactionFormData(formData);

  const existing = await findOwned(transactions, id, session.groupId);
  if (!existing) throw new Error("Transaction not found");
  if (existing.type === "adjustment") {
    throw new Error("Use updateAdjustmentTransaction for adjustments");
  }

  const sourceAccount = await findOwned(
    accounts,
    parsed.accountId,
    session.groupId,
  );
  if (!sourceAccount) throw new Error("Account not found");

  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({
        date: parsed.date ?? null,
        type: parsed.type,
        description: parsed.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id));

    // Wipe and re-insert legs + lines. Simpler than diffing and covers all
    // type-switch cases (e.g. expense → transfer changes leg count).
    await tx
      .delete(transactionLegs)
      .where(eq(transactionLegs.transactionId, id));
    await tx
      .delete(transactionLines)
      .where(eq(transactionLines.transactionId, id));

    await insertLegsAndLines(tx, id, parsed, sourceAccount, session.groupId);
  });

  redirect("/");
}

/**
 * Edit an adjustment transaction. Type and account are fixed; only date,
 * description, and the signed leg amount can change.
 */
export async function updateAdjustmentTransaction(
  id: string,
  formData: FormData,
) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = adjustmentSchema.parse({
    date: formData.get("date"),
    amount: formData.get("amount"),
    description: pick(formData, "description"),
  });

  const existing = await findOwned(transactions, id, session.groupId);
  if (!existing) throw new Error("Transaction not found");
  if (existing.type !== "adjustment") {
    throw new Error("Not an adjustment transaction");
  }

  // Adjustments have exactly one leg; use it to derive the account currency.
  const [leg] = await db
    .select({
      id: transactionLegs.id,
      accountId: transactionLegs.accountId,
      currency: accounts.currency,
    })
    .from(transactionLegs)
    .innerJoin(accounts, eq(accounts.id, transactionLegs.accountId))
    .where(eq(transactionLegs.transactionId, id))
    .limit(1);
  if (!leg) throw new Error(`Invariant: adjustment ${id} has no leg`);

  const amountMinor = parseMoney(parsed.amount, leg.currency);

  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({
        date: parsed.date,
        description: parsed.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id));
    await tx
      .update(transactionLegs)
      .set({ amount: amountMinor })
      .where(eq(transactionLegs.id, leg.id));
  });

  redirect("/");
}

export async function deleteTransaction(id: string) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const tx = await findOwned(transactions, id, session.groupId);
  if (!tx) throw new Error("Transaction not found");

  // transaction_legs and transaction_lines both ON DELETE CASCADE, so a
  // single delete here also clears them.
  await db.delete(transactions).where(eq(transactions.id, id));

  // TODO: replace manual path invalidation with revalidateTag("transactions")
  // or similar once we grow more pages that reference this data.
  revalidatePath("/");
  redirect("/");
}
