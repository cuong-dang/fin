import type { Account, AccountGroup } from "@fin/schemas";
import {
  Alert,
  Button,
  Container,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "@/components/back-link";
import { CREATE_NEW, GroupSelector } from "@/features/accounts/group-selector";
import { localDateKey } from "@/lib/dates";
import { getAccount, listAccountGroups, updateAccount } from "@/lib/endpoints";
import { formatMoney, formatMoneyPlain } from "@/lib/money";

export function AccountEditRoute() {
  const { id } = useParams<{ id: string }>();
  const accountQ = useQuery({
    queryKey: ["account", id],
    queryFn: () => getAccount(id!),
    enabled: !!id,
  });
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });

  if (accountQ.isLoading || groupsQ.isLoading) return null;
  if (!accountQ.data) {
    return (
      <Container size="xs" py="xl">
        <Stack>
          <BackLink to="/accounts" />
          <Text size="sm">Account not found.</Text>
        </Stack>
      </Container>
    );
  }
  return <Form account={accountQ.data} groups={groupsQ.data ?? []} />;
}

function Form({
  account,
  groups,
}: {
  account: Account;
  groups: AccountGroup[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const initialBalance = formatMoneyPlain(
    BigInt(account.presentBalance),
    account.currency,
  );
  const [name, setName] = useState(account.name);
  const [groupValue, setGroupValue] = useState(account.accountGroupId);
  const [newGroupName, setNewGroupName] = useState("");
  const [balance, setBalance] = useState(initialBalance);

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof updateAccount>[1]) =>
      updateAccount(account.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account", account.id] });
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      navigate("/accounts");
    },
  });

  return (
    <Container size="xs" py="xl">
      <Stack>
        <BackLink to="/accounts" />
        <Title order={2}>Edit account</Title>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const creatingNew = groupValue === CREATE_NEW;
            mutation.mutate({
              name,
              accountGroupId: !creatingNew ? groupValue : undefined,
              newGroupName: creatingNew ? newGroupName : undefined,
              balance: balance !== initialBalance ? balance : undefined,
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
            />
            <TextInput label="Currency" value={account.currency} disabled />
            <GroupSelector
              groups={groups}
              value={groupValue}
              onValueChange={setGroupValue}
              newGroupName={newGroupName}
              onNewGroupNameChange={setNewGroupName}
            />
            <TextInput
              label="Balance"
              type="number"
              step="any"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              description={`Current: ${formatMoney(BigInt(account.presentBalance), account.currency)}. Changing this records an adjustment transaction for the delta.`}
            />
            {mutation.error && (
              <Alert color="red">{(mutation.error as Error).message}</Alert>
            )}
            <Group>
              <Button type="submit" loading={mutation.isPending}>
                Save
              </Button>
              <Button component={Link} to="/accounts" variant="subtle">
                Cancel
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
