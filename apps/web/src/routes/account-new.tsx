import type { Account, AccountType, RecurringFrequency } from "@fin/schemas";
import {
  Alert,
  Button,
  Group,
  NativeSelect,
  SegmentedControl,
  Stack,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import {
  type CategoryLineFormValues,
  packCategoryLine,
} from "@/components/category-selector";
import { MultiLineEditor } from "@/components/line-editor";
import { MoneyField } from "@/components/money-field";
import { PageShell } from "@/components/page-shell";
import { CREATE_NEW, GroupSelector } from "@/features/accounts/group-selector";
import { COMMON_CURRENCIES } from "@/lib/currencies";
import { localDateKey } from "@/lib/dates";
import {
  createAccount,
  listAccountGroups,
  listAccounts,
  listCategories,
  listTags,
} from "@/lib/endpoints";

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const emptyLine = (): CategoryLineFormValues => ({
  amount: "",
  categoryId: "",
  newCategoryName: "",
  subcategoryId: "",
  newSubcategoryName: "",
  tagNames: [],
});

export function AccountNewRoute() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: listTags });

  const [type, setType] = useState<AccountType>("checking_savings");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [groupId, setGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [startingBalance, setStartingBalance] = useState("");
  // CC-specific state
  const [creditLimit, setCreditLimit] = useState("");
  const [defaultPayFromAccountId, setDefaultPayFromAccountId] = useState("");
  // Loan-specific state (mirrors recurringPlanBody)
  const [amountPerPeriod, setAmountPerPeriod] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [firstPaymentDate, setFirstPaymentDate] = useState("");
  const [planPayFromId, setPlanPayFromId] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planLines, setPlanLines] = useState<CategoryLineFormValues[]>([]);

  const mutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      navigate("/");
    },
  });

  const groups = groupsQ.data ?? [];
  const accounts = accountsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const tags = tagsQ.data ?? [];
  const checkingAccounts = accounts.filter(
    (a: Account) => a.type === "checking_savings",
  );
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const allTagNames = tags.map((t) => t.name);
  const hasGroups = groups.length > 0;

  function updatePlanLine(i: number, patch: Partial<CategoryLineFormValues>) {
    setPlanLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  return (
    <PageShell back="/" title="New account">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const creatingNewGroup = !hasGroups || groupId === CREATE_NEW;
          const common = {
            name,
            currency,
            accountGroupId: creatingNewGroup ? undefined : groupId,
            newGroupName: creatingNewGroup ? newGroupName : undefined,
            startingBalance: startingBalance ? startingBalance : "0",
            adjustmentDate: localDateKey(new Date()),
          };
          if (type === "credit_card") {
            mutation.mutate({
              type: "credit_card",
              ...common,
              creditLimit,
              defaultPayFromAccountId: defaultPayFromAccountId || undefined,
            });
          } else if (type === "loan") {
            mutation.mutate({
              type: "loan",
              ...common,
              recurringPlan: {
                amountPerPeriod,
                frequency,
                firstPaymentDate,
                defaultAccountId: planPayFromId || undefined,
                description: planDescription || undefined,
                defaultLines: planLines.map(packCategoryLine),
              },
            });
          } else {
            mutation.mutate({ type: "checking_savings", ...common });
          }
        }}
      >
        <Stack>
          <SegmentedControl
            data={[
              { value: "checking_savings", label: "Checking / savings" },
              { value: "credit_card", label: "Credit card" },
              { value: "loan", label: "Loan" },
            ]}
            value={type}
            onChange={(v) => setType(v as AccountType)}
          />
          <TextInput
            data-autofocus
            label="Name"
            maxLength={100}
            placeholder={
              type === "credit_card"
                ? "Chase Sapphire"
                : type === "loan"
                  ? "Mortgage"
                  : "Chase Checking"
            }
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <NativeSelect
            data={COMMON_CURRENCIES}
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
          {hasGroups ? (
            <GroupSelector
              groups={groups}
              newGroupName={newGroupName}
              value={groupId}
              onNewGroupNameChange={setNewGroupName}
              onValueChange={setGroupId}
            />
          ) : (
            <TextInput
              label="New group name"
              maxLength={100}
              placeholder="Banks"
              required
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
          )}
          {type === "credit_card" && (
            <>
              <MoneyField
                label="Credit limit"
                min={0}
                value={creditLimit}
                onChange={setCreditLimit}
              />
              <NativeSelect
                data={[
                  { value: "", label: "— No default —" },
                  ...checkingAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${a.currency})`,
                  })),
                ]}
                description="Pre-fills the source account when paying this card."
                label="Default pay-from account (optional)"
                value={defaultPayFromAccountId}
                onChange={(e) => setDefaultPayFromAccountId(e.target.value)}
              />
            </>
          )}
          {type === "loan" && (
            <>
              <MoneyField
                label="Amount per period"
                min={0}
                value={amountPerPeriod}
                onChange={setAmountPerPeriod}
              />
              <NativeSelect
                data={FREQUENCY_OPTIONS}
                label="Frequency"
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as RecurringFrequency)
                }
              />
              <TextInput
                label="First payment date"
                required
                type="date"
                value={firstPaymentDate}
                onChange={(e) => setFirstPaymentDate(e.target.value)}
              />
              <NativeSelect
                data={[
                  { value: "", label: "— No default —" },
                  ...checkingAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${a.currency})`,
                  })),
                ]}
                description="Pre-fills the source when paying this loan."
                label="Default pay-from account (optional)"
                value={planPayFromId}
                onChange={(e) => setPlanPayFromId(e.target.value)}
              />
              <TextInput
                label="Description (optional)"
                maxLength={500}
                value={planDescription}
                onChange={(e) => setPlanDescription(e.target.value)}
              />
              <MultiLineEditor
                allTags={allTagNames}
                amountOptional
                categories={expenseCategories}
                lines={planLines}
                onAdd={() => setPlanLines((prev) => [...prev, emptyLine()])}
                onRemove={(i) =>
                  setPlanLines((prev) => prev.filter((_, idx) => idx !== i))
                }
                onUpdate={updatePlanLine}
              />
            </>
          )}
          <MoneyField
            description={
              type === "credit_card"
                ? "Outstanding balance you currently owe (enter as a negative number)."
                : type === "loan"
                  ? "Current debt (enter as a negative number). Defaults to 0 if you're starting tracking from today and recording payments going forward."
                  : undefined
            }
            label="Starting balance (optional)"
            required={false}
            value={startingBalance}
            onChange={setStartingBalance}
          />
          {mutation.error && (
            <Alert color="red">{(mutation.error as Error).message}</Alert>
          )}
          <Group>
            <Button loading={mutation.isPending} type="submit">
              Create
            </Button>
            <Button component={Link} to="/" variant="subtle">
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>
    </PageShell>
  );
}
