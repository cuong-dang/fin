import type { Account, AccountGroup } from "@fin/schemas";
import {
  Alert,
  Button,
  Container,
  Group,
  Stack,
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
import { NotFoundRoute } from "./not-found";

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
  if (accountQ.error || groupsQ.error) {
    return <Alert color="red">Failed to load account.</Alert>;
  }
  if (!accountQ.data) return <NotFoundRoute />;
  return <Form account={accountQ.data} groups={groupsQ.data!} />;
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
  const [groupId, setGroupId] = useState(account.accountGroupId);
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
    <Container>
      <Stack>
        <BackLink to="/accounts" />
        <Title order={2}>Edit account</Title>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const creatingNewGroup = groupId === CREATE_NEW;
            mutation.mutate({
              name,
              accountGroupId: creatingNewGroup ? undefined : groupId,
              newGroupName: creatingNewGroup ? newGroupName : undefined,
              newBalance: balance !== initialBalance ? balance : undefined,
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
              value={groupId}
              onValueChange={setGroupId}
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
