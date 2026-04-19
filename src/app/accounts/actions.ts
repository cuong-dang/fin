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
import { todayUTCDate } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { getCurrentSession } from "@/lib/session";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  accountGroupId: z.uuid().optional(),
  newGroupName: z.string().trim().min(1).max(100).optional(),
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
    accountGroupId: emptyToUndef(formData.get("accountGroupId")),
    newGroupName: emptyToUndef(formData.get("newGroupName")),
    balance: emptyToUndef(formData.get("balance")),
  });

  // newGroupName wins over accountGroupId — see createAccount for the same
  // rationale.
  if (!parsed.accountGroupId && !parsed.newGroupName) {
    throw new Error("Select an existing group or name a new one");
  }

  const account = await findOwned(accounts, accountId, session.groupId);
  if (!account) throw new Error("Account not found");

  // Validate existing group pick up front; new group is created inside the tx.
  if (!parsed.newGroupName && parsed.accountGroupId) {
    const targetGroup = await findOwned(
      accountGroups,
      parsed.accountGroupId,
      session.groupId,
    );
    if (!targetGroup) throw new Error("Destination group not found");
  }

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
    let accountGroupId = parsed.accountGroupId;
    if (parsed.newGroupName) {
      const [row] = await tx
        .insert(accountGroups)
        .values({ groupId: session.groupId, name: parsed.newGroupName })
        .returning({ id: accountGroups.id });
      accountGroupId = row.id;
    }

    await tx
      .update(accounts)
      .set({
        name: parsed.name,
        accountGroupId: accountGroupId!,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, accountId));

    if (delta !== 0n) {
      const [txRow] = await tx
        .insert(transactions)
        .values({
          groupId: session.groupId,
          userId: session.userId,
          date: todayUTCDate(),
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

  // TODO: replace manual path invalidation with revalidateTag("accounts") or
  // similar once we grow more pages that reference this data.
  revalidatePath("/");
  revalidatePath("/accounts");
}
