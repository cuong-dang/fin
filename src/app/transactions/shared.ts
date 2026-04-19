import { z } from "zod";
import { db } from "@/db";
import {
  accounts,
  categories,
  subcategories,
  transactionLegs,
  transactionLines,
} from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { parseMoney } from "@/lib/money";

// ─── Schemas ──────────────────────────────────────────────────────────────

// Plain calendar date — no time, no timezone. "YYYY-MM-DD".
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const baseSchema = z.object({
  // Optional because pending transactions have no date yet. When not
  // pending the action enforces presence; see parseTransactionFormData.
  date: z.string().regex(DATE_RE, "Expected YYYY-MM-DD").optional(),
  amount: z.string().trim().min(1),
  description: z.string().trim().max(500).optional(),
  tagId: z.uuid().optional(),
});

// For income/expense, category + subcategory can be picked (existing id) OR
// created inline (typed name). Exactly one of categoryId/newCategoryName must
// be present; subcategory is fully optional.
const categoryFields = {
  categoryId: z.uuid().optional(),
  newCategoryName: z.string().trim().min(1).max(100).optional(),
  subcategoryId: z.uuid().optional(),
  newSubcategoryName: z.string().trim().min(1).max(100).optional(),
};

const incomeSchema = baseSchema.extend({
  type: z.literal("income"),
  accountId: z.uuid(),
  ...categoryFields,
});

const expenseSchema = baseSchema.extend({
  type: z.literal("expense"),
  accountId: z.uuid(),
  ...categoryFields,
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

export type ParsedTransaction = z.infer<typeof fullTransactionSchema> & {
  pending: boolean;
};

// ─── Form helpers ─────────────────────────────────────────────────────────

/** FormData value → string | undefined; empty/whitespace/file coerces to undefined. */
export function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Parse the full FormData for create or update. Identical shape for both.
 * Derives `pending` from the form's "pending" field (checkbox or hidden
 * input with value "true"/"false"/"on"). When not pending, date is
 * required; when pending, any submitted date is discarded.
 */
export function parseTransactionFormData(
  formData: FormData,
): ParsedTransaction {
  const pendingRaw = formData.get("pending");
  const pending = pendingRaw === "on" || pendingRaw === "true";

  const base = fullTransactionSchema.parse({
    type: formData.get("type"),
    date: pick(formData, "date"),
    amount: formData.get("amount"),
    accountId: pick(formData, "accountId"),
    destinationAccountId: pick(formData, "destinationAccountId"),
    categoryId: pick(formData, "categoryId"),
    newCategoryName: pick(formData, "newCategoryName"),
    subcategoryId: pick(formData, "subcategoryId"),
    newSubcategoryName: pick(formData, "newSubcategoryName"),
    tagId: pick(formData, "tagId"),
    description: pick(formData, "description"),
  });

  if (pending) {
    return { ...base, date: undefined, pending: true };
  }
  if (!base.date) {
    throw new Error("Date is required for non-pending transactions");
  }
  return { ...base, pending: false };
}

// ─── Write logic ──────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Insert legs + lines for a transaction. Caller is responsible for having
 * already created (or wiped + re-created) the `transactions` row with the
 * given id. For income/expense, resolves (or creates) the category and
 * optional subcategory inline. For transfers, validates the destination
 * account + currency match.
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
    // Resolve or create the category. newCategoryName wins over categoryId —
    // same rationale as account groups: if you typed a name, that's what you
    // meant.
    let categoryId = parsed.categoryId;
    if (parsed.newCategoryName) {
      const [row] = await tx
        .insert(categories)
        .values({
          groupId: workspaceGroupId,
          kind: parsed.type,
          name: parsed.newCategoryName,
        })
        .returning({ id: categories.id });
      categoryId = row.id;
    }
    if (!categoryId) {
      throw new Error("Category is required (pick one or name a new one)");
    }

    // Resolve or create the subcategory. Subcategory is optional overall;
    // only process if either field is present.
    let subcategoryId = parsed.subcategoryId ?? null;
    if (parsed.newSubcategoryName) {
      const [row] = await tx
        .insert(subcategories)
        .values({ categoryId, name: parsed.newSubcategoryName })
        .returning({ id: subcategories.id });
      subcategoryId = row.id;
    }

    const sign = parsed.type === "income" ? 1n : -1n;
    await tx.insert(transactionLegs).values({
      transactionId,
      accountId: parsed.accountId,
      amount: sign * amountMinor,
    });
    await tx.insert(transactionLines).values({
      transactionId,
      categoryId,
      subcategoryId,
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
