import {
  Alert,
  Button,
  Container,
  Group,
  NativeSelect,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { BackLink } from "@/components/back-link";
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
    <Container size="xs" py="xl">
      <Stack>
        <BackLink to="/" />
        <Title order={2}>New account</Title>
        <form onSubmit={onSubmit}>
          <Stack>
            <TextInput
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-autofocus
              maxLength={100}
              placeholder="Chase Checking"
            />
            <NativeSelect
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              data={COMMON_CURRENCIES}
            />
            {hasGroups ? (
              <GroupSelector
                groups={groups}
                value={groupValue}
                onValueChange={setGroupValue}
                newGroupName={newGroupName}
                onNewGroupNameChange={setNewGroupName}
              />
            ) : (
              <TextInput
                label="New group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                required
                maxLength={100}
                placeholder="Banks"
              />
            )}
            <TextInput
              label="Starting balance (optional)"
              type="number"
              step="any"
              inputMode="decimal"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              placeholder="0.00"
            />
            {mutation.error && (
              <Alert color="red">{(mutation.error as Error).message}</Alert>
            )}
            <Group>
              <Button type="submit" loading={mutation.isPending}>
                Create account
              </Button>
              <Button component={Link} to="/" variant="subtle">
                Cancel
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
