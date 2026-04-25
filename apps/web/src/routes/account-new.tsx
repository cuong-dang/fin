import { BackLink } from "@/components/back-link";
import { CREATE_NEW, GroupSelector } from "@/features/accounts/group-selector";
import { localDateKey } from "@/lib/dates";
import { createAccount, listAccountGroups } from "@/lib/endpoints";
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
              data-autofocus
              label="Name"
              maxLength={100}
              placeholder="Chase Checking"
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
            <TextInput
              inputMode="decimal"
              label="Starting balance (optional)"
              placeholder="0.00"
              step="any"
              type="number"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
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
      </Stack>
    </Container>
  );
}
