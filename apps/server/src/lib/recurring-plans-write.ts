import type { RecurringPlanBody } from "@fin/schemas";

import { schema } from "../db";
import { db } from "../db";
import { resolveCategory } from "./categories-resolve";
import { parseMoney } from "./money";
import { upsertTags } from "./tags-upsert";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Insert a recurring_plans row + its default lines + tags. Returns the
 * plan id so the caller can link it (e.g., from `accounts.recurring_plan_id`).
 * Default-line amounts are optional — for amortizing loans the principal/
 * interest split changes per period, so the template records categorization
 * but leaves amounts to be filled in at transaction time.
 */
export async function insertRecurringPlan(
  tx: Tx,
  body: RecurringPlanBody,
  currency: string,
  workspaceGroupId: string,
): Promise<string> {
  const amountPerPeriodMinor = parseMoney(body.amountPerPeriod, currency);
  if (amountPerPeriodMinor <= 0n) {
    throw new Error("amountPerPeriod must be positive");
  }

  const [plan] = await tx
    .insert(schema.recurringPlans)
    .values({
      groupId: workspaceGroupId,
      amountPerPeriod: amountPerPeriodMinor,
      currency,
      frequency: body.frequency,
      firstPaymentDate: body.firstPaymentDate,
      defaultAccountId: body.defaultAccountId ?? null,
      description: body.description ?? null,
    })
    .returning({ id: schema.recurringPlans.id });

  // Default lines: amount may be omitted (varies per period). Categories
  // for new loan lines are always expense-side (interest/fees/etc).
  const lineAmounts = body.defaultLines.map((l) =>
    l.amount ? parseMoney(l.amount, currency) : null,
  );
  if (lineAmounts.some((m) => m !== null && m <= 0n)) {
    throw new Error("Each default line amount must be positive when set");
  }

  for (let i = 0; i < body.defaultLines.length; i++) {
    const line = body.defaultLines[i];
    const { categoryId, subcategoryId } = await resolveCategory(
      tx,
      line,
      "expense",
      workspaceGroupId,
    );
    const [row] = await tx
      .insert(schema.recurringPlanDefaultLines)
      .values({
        recurringPlanId: plan.id,
        categoryId,
        subcategoryId,
        amount: lineAmounts[i],
        currency,
      })
      .returning({ id: schema.recurringPlanDefaultLines.id });

    if (line.tagNames && line.tagNames.length > 0) {
      const byName = await upsertTags(tx, line.tagNames, workspaceGroupId);
      const unique = [...new Set(line.tagNames)];
      await tx.insert(schema.recurringPlanDefaultLineTags).values(
        unique.map((name) => {
          const tagId = byName.get(name);
          if (!tagId) throw new Error(`Invariant: tag "${name}" not resolved`);
          return { lineId: row.id, tagId };
        }),
      );
    }
  }

  return plan.id;
}
