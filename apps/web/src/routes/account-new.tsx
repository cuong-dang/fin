import { CreatableSelect } from "@/components/creatable-select";
import { MoneyField } from "@/components/money-field";
import { PageShell } from "@/components/page-shell";
import {
  CcFields,
  LoanPlanFields,
} from "@/features/accounts/account-form-fields";
import { COMMON_CURRENCIES } from "@/lib/currencies";
import { localDateKey } from "@/lib/dates";
import {
  createAccount,
  listAccountGroups,
  listAccounts,
  listCategories,
  listTags,
} from "@/lib/endpoints";

import type {
  Account,
  AccountType,
  RecurringFrequency,
  TransactionLineBody,
} from "@fin/schemas";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

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
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });

  const [type, setType] = useState<AccountType>("checking_savings");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [groupId, setGroupId] = useState("");
  const [newGroupName, setNewAccountGroupName] = useState("");
  const [startingBalance, setStartingBalance] = useState("");
  // CC-specific state
  const [creditLimit, setCreditLimit] = useState("");
  const [defaultPayFromAccountId, setDefaultPayFromAccountId] = useState("");
  // Loan-specific state (mirrors loanBody)
  const [amountPerPeriod, setAmountPerPeriod] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [loanLines, setloanLines] = useState<TransactionLineBody[]>([]);
  const [excludeFromNetWorth, setExcludeFromNetWorth] = useState(false);

  const goBack = () => navigate(-1);

  const mutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      goBack();
    },
  });

  const groups = groupsQ.data ?? [];
  const hasGroups = groups.length > 0;
  const groupName = groups.find((g) => g.id === groupId)?.name ?? newGroupName;
  const handleGroupName = (name: string) => {
    const match = groups.find((c) => c.name === name);
    if (match) {
      setGroupId(match.id);
      setNewAccountGroupName("");
    } else {
      setGroupId("");
      setNewAccountGroupName(name);
    }
  };

  const accounts = accountsQ.data ?? [];
  const checkingAccounts = accounts.filter(
    (a: Account) => a.type === "checking_savings",
  );
  const loanPayFromAccounts = accounts.filter(
    (a: Account) => a.type !== "loan",
  );

  return (
    <PageShell title="New account">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const creatingNewGroup = !hasGroups || groupId === "";
          const common = {
            name,
            currency,
            accountGroupId: creatingNewGroup ? undefined : groupId,
            newAccountGroupName: creatingNewGroup ? newGroupName : undefined,
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
              defaultPayFromAccountId: defaultPayFromAccountId || undefined,
              loan: {
                amountPerPeriod,
                frequency,
                defaultLines: loanLines,
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
          <Select
            data={COMMON_CURRENCIES}
            label="Currency"
            required
            value={currency}
            onChange={(v) => setCurrency(v!)}
          />
          {hasGroups ? (
            <CreatableSelect
              data={groups.map((g) => g.name)}
              label="Account group"
              required={true}
              value={groupName}
              onChange={handleGroupName}
            />
          ) : (
            <TextInput
              label="New account group name"
              maxLength={100}
              placeholder="Banks"
              required
              value={newGroupName}
              onChange={(e) => handleGroupName(e.target.value)}
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
              defaultPayFromAccountId={defaultPayFromAccountId}
              frequency={frequency}
              lines={loanLines}
              payFromAccounts={loanPayFromAccounts}
              setAmountPerPeriod={setAmountPerPeriod}
              setDefaultPayFromAccountId={setDefaultPayFromAccountId}
              setFrequency={setFrequency}
              setLines={setloanLines}
              tags={tagsQ.data ?? []}
            />
          )}
          <MoneyField
            description={
              type === "credit_card"
                ? "Outstanding balance you currently owe (enter as a negative number)."
                : type === "loan"
                  ? "Leave at 0 if you'd like to record the financed purchase as a separate expense from this loan account — that way the spending lands in a category and the loan balance goes negative automatically. Otherwise, enter the current debt as a negative number."
                  : ""
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
            <Button variant="subtle" onClick={goBack}>
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>
    </PageShell>
  );
}
