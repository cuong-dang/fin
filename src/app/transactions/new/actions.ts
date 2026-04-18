"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  accounts,
  transactionLegs,
  transactionLines,
  transactions,
} from "@/db/schema";
import { parseMoney } from "@/lib/money";
import { getCurrentSession } from "@/lib/session";

// ─── Schemas ──────────────────────────────────────────────────────────────

const baseSchema = z.object({
  timestamp: z.coerce.date(),
  amount: z.string().trim().min(1),
  description: z.string().trim().max(500).optional(),
  tagId: z.uuid().optional(),
});

const incomeSchema = baseSchema.extend({
  type: z.literal("income"),
  accountId: z.uuid(),
  categoryId: z.uuid(),
  subcategoryId: z.uuid().optional(),
});

const expenseSchema = baseSchema.extend({
  type: z.literal("expense"),
  accountId: z.uuid(),
  categoryId: z.uuid(),
  subcategoryId: z.uuid().optional(),
});

const transferSchema = baseSchema.extend({
  type: z.literal("transfer"),
  accountId: z.uuid(),
  destinationAccountId: z.uuid(),
});

const schema = z.discriminatedUnion("type", [
  incomeSchema,
  expenseSchema,
  transferSchema,
]);

// ─── Action ───────────────────────────────────────────────────────────────

export async function createTransaction(formData: FormData) {
  const session = await getCurrentSession();
  if (!session?.groupId) throw new Error("No active group");

  // Coerce empty form strings to undefined so optional UUIDs validate.
  const pick = (key: string): string | undefined => {
    const v = formData.get(key);
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed === "" ? undefined : trimmed;
  };

  const parsed = schema.parse({
    type: formData.get("type"),
    timestamp: formData.get("timestamp"),
    amount: formData.get("amount"),
    accountId: pick("accountId"),
    destinationAccountId: pick("destinationAccountId"),
    categoryId: pick("categoryId"),
    subcategoryId: pick("subcategoryId"),
    tagId: pick("tagId"),
    description: pick("description"),
  });

  const [sourceAccount] = await db
    .select({ currency: accounts.currency, groupId: accounts.groupId })
    .from(accounts)
    .where(eq(accounts.id, parsed.accountId))
    .limit(1);
  if (!sourceAccount || sourceAccount.groupId !== session.groupId) {
    throw new Error("Account not found");
  }

  const amountMinor = parseMoney(parsed.amount, sourceAccount.currency);
  if (amountMinor <= 0n) throw new Error("Amount must be positive");

  await db.transaction(async (tx) => {
    const [txRow] = await tx
      .insert(transactions)
      .values({
        groupId: session.groupId!,
        userId: session.userId,
        timestamp: parsed.timestamp,
        type: parsed.type,
        description: parsed.description ?? null,
      })
      .returning();

    if (parsed.type === "income" || parsed.type === "expense") {
      const sign = parsed.type === "income" ? 1n : -1n;
      await tx.insert(transactionLegs).values({
        transactionId: txRow.id,
        accountId: parsed.accountId,
        amount: sign * amountMinor,
      });
      await tx.insert(transactionLines).values({
        transactionId: txRow.id,
        categoryId: parsed.categoryId,
        subcategoryId: parsed.subcategoryId ?? null,
        tagId: parsed.tagId ?? null,
        amount: amountMinor,
        currency: sourceAccount.currency,
      });
      return;
    }

    // transfer
    if (parsed.accountId === parsed.destinationAccountId) {
      throw new Error("Source and destination accounts must differ");
    }
    const [destAccount] = await tx
      .select({ currency: accounts.currency, groupId: accounts.groupId })
      .from(accounts)
      .where(eq(accounts.id, parsed.destinationAccountId))
      .limit(1);
    if (!destAccount || destAccount.groupId !== session.groupId) {
      throw new Error("Destination account not found");
    }
    if (destAccount.currency !== sourceAccount.currency) {
      throw new Error(
        "FX transfers not yet supported — accounts must share a currency",
      );
    }

    await tx.insert(transactionLegs).values([
      {
        transactionId: txRow.id,
        accountId: parsed.accountId,
        amount: -amountMinor,
      },
      {
        transactionId: txRow.id,
        accountId: parsed.destinationAccountId,
        amount: amountMinor,
      },
    ]);
    // Plain transfer: no lines.
  });

  redirect("/");
}
