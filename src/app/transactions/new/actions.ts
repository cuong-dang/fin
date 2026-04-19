"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { getCurrentSession } from "@/lib/session";
import { insertLegsAndLines, parseTransactionFormData } from "../shared";

export async function createTransaction(formData: FormData) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthenticated");

  const parsed = parseTransactionFormData(formData);

  const sourceAccount = await findOwned(
    accounts,
    parsed.accountId,
    session.groupId,
  );
  if (!sourceAccount) throw new Error("Account not found");

  await db.transaction(async (tx) => {
    const [txRow] = await tx
      .insert(transactions)
      .values({
        groupId: session.groupId,
        userId: session.userId,
        date: parsed.date ?? null,
        type: parsed.type,
        description: parsed.description ?? null,
      })
      .returning({ id: transactions.id });

    await insertLegsAndLines(
      tx,
      txRow.id,
      parsed,
      sourceAccount,
      session.groupId,
    );
  });

  redirect("/");
}
