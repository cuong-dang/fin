"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  accountGroups,
  accounts,
  transactionLegs,
  transactions,
} from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { parseMoney } from "@/lib/money";
import { getCurrentSession } from "@/lib/session";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  accountGroupId: z.uuid(),
  balance: z.string().trim().optional(),
});

function emptyToUndef(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function updateAccount(accountId: string, formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = updateSchema.parse({
    name: formData.get("name"),
    accountGroupId: formData.get("accountGroupId"),
    balance: emptyToUndef(formData.get("balance")),
  });

  const account = await findOwned(accounts, accountId, session.groupId);
  if (!account) throw new Error("Account not found");

  const targetGroup = await findOwned(
    accountGroups,
    parsed.accountGroupId,
    session.groupId,
  );
  if (!targetGroup) throw new Error("Destination group not found");

  // Compute the balance delta up front so a parse error aborts before we
  // touch the DB.
  let delta = 0n;
  if (parsed.balance !== undefined) {
    const newMinor = parseMoney(parsed.balance, account.currency);
    const [{ current }] = await db
      .select({
        current: sql<string>`COALESCE(SUM(${transactionLegs.amount}), 0)`,
      })
      .from(transactionLegs)
      .where(eq(transactionLegs.accountId, accountId));
    delta = newMinor - BigInt(current);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({
        name: parsed.name,
        accountGroupId: parsed.accountGroupId,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, accountId));

    if (delta !== 0n) {
      const [txRow] = await tx
        .insert(transactions)
        .values({
          groupId: session.groupId,
          userId: session.userId,
          timestamp: new Date(),
          type: "adjustment",
          description: null,
        })
        .returning({ id: transactions.id });
      await tx.insert(transactionLegs).values({
        transactionId: txRow.id,
        accountId,
        amount: delta,
      });
    }
  });

  redirect("/accounts");
}

export async function deleteAccount(accountId: string) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const account = await findOwned(accounts, accountId, session.groupId);
  if (!account) throw new Error("Account not found");

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
