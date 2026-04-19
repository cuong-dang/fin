"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";

/**
 * Limited edit form for adjustment transactions. Only date, description,
 * and the signed leg amount are editable — type and account are fixed.
 */
export function AdjustmentEditForm({
  action,
  initial,
}: {
  action: (formData: FormData) => Promise<void>;
  initial: { date: string; amount: string; description: string };
}) {
  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="Amount" htmlFor="amount">
        <MoneyInput
          id="amount"
          name="amount"
          required
          defaultValue={initial.amount}
        />
      </Field>
      <Field label="Date" htmlFor="date">
        <Input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={initial.date}
        />
      </Field>
      <Field label="Description" htmlFor="description">
        <Input
          id="description"
          type="text"
          name="description"
          maxLength={500}
          defaultValue={initial.description}
        />
      </Field>
      <div className="flex items-center gap-2 pt-4">
        <Button type="submit">Save</Button>
        <Button asChild variant="ghost">
          <Link href="/">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
