import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { CREATE_NEW, GroupSelector } from "@/features/accounts/group-selector";
import { localDateKey } from "@/lib/dates";
import { createAccount, listAccountGroups } from "@/lib/endpoints";

const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CNY",
  "VND",
  "KRW",
  "INR",
];

export function AccountNewRoute() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [groupValue, setGroupValue] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [startingBalance, setStartingBalance] = useState("");

  const mutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      navigate("/");
    },
  });

  const groups = groupsQ.data ?? [];
  const hasGroups = groups.length > 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const creatingNew = !hasGroups || groupValue === CREATE_NEW;
    mutation.mutate({
      name,
      currency,
      accountGroupId: !creatingNew ? groupValue : undefined,
      newGroupName: creatingNew
        ? hasGroups
          ? newGroupName
          : newGroupName || name
        : undefined,
      startingBalance: startingBalance || undefined,
      adjustmentDate: localDateKey(new Date()),
    });
  }

  return (
    <FormPage>
      <BackLink to="/" />
      <h1 className="mt-4 text-2xl font-semibold">New account</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            maxLength={100}
            placeholder="Chase Checking"
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <NativeSelect
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {hasGroups ? (
          <GroupSelector
            groups={groups}
            value={groupValue}
            onValueChange={setGroupValue}
            newGroupName={newGroupName}
            onNewGroupNameChange={setNewGroupName}
          />
        ) : (
          <Field label="New group name" htmlFor="newGroupName">
            <Input
              id="newGroupName"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              required
              maxLength={100}
              placeholder="Banks"
            />
          </Field>
        )}
        <Field label="Starting balance (optional)" htmlFor="startingBalance">
          <MoneyInput
            id="startingBalance"
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        {mutation.error && (
          <p className="text-destructive text-sm">
            {(mutation.error as Error).message}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create account"}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">Cancel</Link>
          </Button>
        </div>
      </form>
    </FormPage>
  );
}
