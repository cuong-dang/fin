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
  "AUD",
  "CAD",
  "CNY",
  "EUR",
  "GBP",
  "JPY",
  "KRW",
  "VND",
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
  const [groupId, setGroupId] = useState("");
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

  return (
    <Container>
      <Stack>
        <BackLink to="/" />
        <Title order={2}>New account</Title>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const creatingNewGroup = !hasGroups || groupId === CREATE_NEW;
            mutation.mutate({
              name,
              currency,
              accountGroupId: creatingNewGroup ? undefined : groupId,
              newGroupName: creatingNewGroup ? newGroupName : undefined,
              startingBalance: startingBalance ? startingBalance : "0",
              adjustmentDate: localDateKey(new Date()),
            });
          }}
        >
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
                value={groupId}
                onValueChange={setGroupId}
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
                Create
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
