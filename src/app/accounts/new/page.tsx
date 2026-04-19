import { eq } from "drizzle-orm";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { LocalTodayInput } from "@/components/local-today-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { db } from "@/db";
import { accountGroups } from "@/db/schema";
import { getCurrentSession } from "@/lib/session";
import { createAccount } from "./actions";
import { GroupSelector } from "../group-selector";

// A small, curated set. Users can type any ISO 4217 code if they need more.
const COMMON_CURRENCIES = [
  "USD",
  "AUD",
  "CAD",
  "CNY",
  "EUR",
  "GBP",
  "JPY",
  "KRW",
  "VND",
];

export default async function NewAccountPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const groups = await db
    .select()
    .from(accountGroups)
    .where(eq(accountGroups.groupId, session.groupId))
    .orderBy(accountGroups.name);

  return (
    <FormPage>
      <BackLink href="/" />
      <h1 className="mt-4 text-2xl font-semibold">New account</h1>
      <form action={createAccount} className="mt-6 space-y-4">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            autoFocus
            maxLength={100}
            placeholder="Chase Checking"
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <NativeSelect id="currency" name="currency" defaultValue="USD">
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {groups.length > 0 ? (
          <GroupSelector groups={groups} />
        ) : (
          <Field label="New group name" htmlFor="newGroupName">
            <Input
              id="newGroupName"
              name="newGroupName"
              required
              maxLength={100}
              placeholder="Banks"
            />
          </Field>
        )}
        <Field label="Starting balance (optional)" htmlFor="startingBalance">
          <MoneyInput
            id="startingBalance"
            name="startingBalance"
            placeholder="0.00"
          />
        </Field>
        <LocalTodayInput name="adjustmentDate" />
        <Button type="submit">Create account</Button>
      </form>
    </FormPage>
  );
}
