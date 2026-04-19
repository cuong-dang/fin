import { z } from "zod";
import { db } from "@/db";
import { accounts, transactionLegs, transactionLines } from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { parseMoney } from "@/lib/money";

// ─── Schemas ──────────────────────────────────────────────────────────────

// Plain calendar date — no time, no timezone. "YYYY-MM-DD".
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const baseSchema = z.object({
  date: z.string().regex(DATE_RE, "Expected YYYY-MM-DD"),
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

export const fullTransactionSchema = z.discriminatedUnion("type", [
  incomeSchema,
  expenseSchema,
  transferSchema,
]);

export type ParsedTransaction = z.infer<typeof fullTransactionSchema>;

// ─── Form helpers ─────────────────────────────────────────────────────────

/** FormData value → string | undefined; empty/whitespace/file coerces to undefined. */
export function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Parse the full FormData for create or update. Identical shape for both. */
export function parseTransactionFormData(formData: FormData): ParsedTransaction {
  return fullTransactionSchema.parse({
    type: formData.get("type"),
    date: formData.get("date"),
    amount: formData.get("amount"),
    accountId: pick(formData, "accountId"),
    destinationAccountId: pick(formData, "destinationAccountId"),
    categoryId: pick(formData, "categoryId"),
    subcategoryId: pick(formData, "subcategoryId"),
    tagId: pick(formData, "tagId"),
    description: pick(formData, "description"),
  });
}

// ─── Write logic ──────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Insert legs + lines for a transaction. Caller is responsible for having
 * already created (or wiped + re-created) the `transactions` row with the
 * given id. For transfers, validates the destination account + currency
 * match. Throws on invariant violations.
 */
export async function insertLegsAndLines(
  tx: Tx,
  transactionId: string,
  parsed: ParsedTransaction,
  sourceAccount: { currency: string },
  workspaceGroupId: string,
): Promise<void> {
  const amountMinor = parseMoney(parsed.amount, sourceAccount.currency);
  if (amountMinor <= 0n) throw new Error("Amount must be positive");

  if (parsed.type === "income" || parsed.type === "expense") {
    const sign = parsed.type === "income" ? 1n : -1n;
    await tx.insert(transactionLegs).values({
      transactionId,
      accountId: parsed.accountId,
      amount: sign * amountMinor,
    });
    await tx.insert(transactionLines).values({
      transactionId,
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
  const destAccount = await findOwned(
    accounts,
    parsed.destinationAccountId,
    workspaceGroupId,
  );
  if (!destAccount) throw new Error("Destination account not found");
  if (destAccount.currency !== sourceAccount.currency) {
    throw new Error(
      "FX transfers not yet supported — accounts must share a currency",
    );
  }
  await tx.insert(transactionLegs).values([
    { transactionId, accountId: parsed.accountId, amount: -amountMinor },
    {
      transactionId,
      accountId: parsed.destinationAccountId,
      amount: amountMinor,
    },
  ]);
  // Plain transfer: no lines.
}
