import type { Account, AccountType, RecurringFrequency } from "@fin/schemas";
import {
  Alert,
  Button,
  Checkbox,
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
import { MoneyField } from "@/components/money-field";
import { PageShell } from "@/components/page-shell";
import {
  CcFields,
  LoanPlanFields,
} from "@/features/accounts/account-form-fields";
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
  const [planPayFromId, setPlanPayFromId] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planLines, setPlanLines] = useState<CategoryLineFormValues[]>([]);
  const [excludeFromNetWorth, setExcludeFromNetWorth] = useState(false);

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
  const checkingAccounts = accounts.filter(
    (a: Account) => a.type === "checking_savings",
  );
  // Loan default pay-from: any non-loan account (checking/savings or CC).
  // Paying a loan with a card is a real flow; only loan-as-pay-from is
  // disallowed.
  const loanPayFromAccounts = accounts.filter(
    (a: Account) => a.type !== "loan",
  );
  const hasGroups = groups.length > 0;

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
            excludeFromNetWorth,
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
            <CcFields
              creditLimit={creditLimit}
              defaultPayFromAccountId={defaultPayFromAccountId}
              payFromAccounts={checkingAccounts}
              setCreditLimit={setCreditLimit}
              setDefaultPayFromAccountId={setDefaultPayFromAccountId}
            />
          )}
          {type === "loan" && (
            <LoanPlanFields
              amountPerPeriod={amountPerPeriod}
              categories={categoriesQ.data ?? []}
              description={planDescription}
              frequency={frequency}
              lines={planLines}
              payFromAccounts={loanPayFromAccounts}
              payFromId={planPayFromId}
              setAmountPerPeriod={setAmountPerPeriod}
              setDescription={setPlanDescription}
              setFrequency={setFrequency}
              setLines={setPlanLines}
              setPayFromId={setPlanPayFromId}
              tags={tagsQ.data ?? []}
            />
          )}
          <MoneyField
            description={
              type === "credit_card"
                ? "Outstanding balance you currently owe (enter as a negative number)."
                : type === "loan"
                  ? "Leave at 0 if you'd like to record the financed purchase as a separate expense from this loan account — that way the spending lands in a category and the loan balance goes negative automatically. Otherwise, enter the current debt as a negative number."
                  : undefined
            }
            label="Starting balance (optional)"
            required={false}
            value={startingBalance}
            onChange={setStartingBalance}
          />
          <Checkbox
            checked={excludeFromNetWorth}
            description="Account stays visible in the sidebar; just doesn't roll into the net-worth total or chart."
            label="Exclude from net worth"
            onChange={(e) => setExcludeFromNetWorth(e.currentTarget.checked)}
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
