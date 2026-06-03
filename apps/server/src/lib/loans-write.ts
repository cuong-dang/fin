import type { LoanBody } from "@fin/schemas";
import { eq } from "drizzle-orm";

import type { Tx } from "../db/index.js";
import { schema } from "../db/index.js";
import { resolveCategory } from "./categories-resolve.js";
import { attachLineTags } from "./line-tags-write.js";
import { parseMoney } from "./money.js";

export async function insertLoan(
  tx: Tx,
  body: LoanBody,
  currency: string,
  workspaceId: string,
): Promise<string> {
  const amountPerPeriodMinor = parseAmountPerPeriod(body, currency);

  const [loan] = await tx
    .insert(schema.loans)
    .values({
      workspaceId,
      amountPerPeriod: amountPerPeriodMinor,
      frequency: body.frequency,
    })
    .returning({ id: schema.loans.id });

  await insertLoanDefaultLines(
    tx,
    loan.id,
    body.defaultLines,
    currency,
    workspaceId,
  );
  return loan.id;
}

async function insertLoanDefaultLines(
  tx: Tx,
  loanId: string,
  lines: LoanBody["defaultLines"],
  currency: string,
  workspaceId: string,
): Promise<void> {
  // Same semantic as bill default lines: `null` = "fill in per
  // charge". A user-typed `0` is meaningless and would otherwise 500
  // — coerce to `null` so clearing the field (via "" or "0") behaves
  // the same. Negative amounts are still rejected.
  const lineAmounts = lines.map((l) => {
    if (!l.amount) return null;
    const parsed = parseMoney(l.amount, currency);
    return parsed === 0n ? null : parsed;
  });
  if (lineAmounts.some((m) => m !== null && m < 0n)) {
    throw new Error("Default line amounts must be non-negative");
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { categoryId, subcategoryId } = await resolveCategory(
      tx,
      line,
      "expense",
      workspaceId,
    );
    const [lineRow] = await tx
      .insert(schema.loanDefaultLines)
      .values({
        loanId,
        categoryId,
        subcategoryId,
        amount: lineAmounts[i],
      })
      .returning({ id: schema.loanDefaultLines.id });

    await attachLineTags(
      tx,
      schema.loanDefaultLineTags,
      lineRow.id,
      line.tagNames,
      workspaceId,
    );
  }
}

export async function updateRecurringPlan(
  tx: Tx,
  loanId: string,
  body: LoanBody,
  currency: string,
  workspaceId: string,
): Promise<void> {
  // No ownership check because this is only called from updating accounts.
  const amountPerPeriodMinor = parseAmountPerPeriod(body, currency);

  await tx
    .update(schema.loans)
    .set({
      amountPerPeriod: amountPerPeriodMinor,
      frequency: body.frequency,
      updatedAt: new Date(),
    })
    .where(eq(schema.loans.id, loanId));

  await tx
    .delete(schema.loanDefaultLines)
    .where(eq(schema.loanDefaultLines.loanId, loanId));
  await insertLoanDefaultLines(
    tx,
    loanId,
    body.defaultLines,
    currency,
    workspaceId,
  );
}

function parseAmountPerPeriod(body: LoanBody, currency: string) {
  const minor = parseMoney(body.amountPerPeriod, currency);
  if (minor <= 0n) throw new Error("amountPerPeriod must be positive");
  return minor;
}
