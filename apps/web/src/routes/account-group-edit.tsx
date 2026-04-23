import type { AccountGroup } from "@fin/schemas";
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
import { listAccountGroups, updateAccountGroup } from "@/lib/endpoints";

export function AccountGroupEditRoute() {
  const { id } = useParams<{ id: string }>();
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const group = groupsQ.data?.find((g) => g.id === id);

  if (groupsQ.isLoading) return null;
  if (!group) {
    return (
      <Container size="xs" py="xl">
        <Stack>
          <BackLink to="/accounts" />
          <Text size="sm">Group not found.</Text>
        </Stack>
      </Container>
    );
  }
  return <Form group={group} />;
}

function Form({ group }: { group: AccountGroup }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);

  const mutation = useMutation({
    mutationFn: (body: { name: string }) => updateAccountGroup(group.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      navigate("/accounts");
    },
  });

  return (
    <Container size="xs" py="xl">
      <Stack>
        <BackLink to="/accounts" />
        <Title order={2}>Edit account group</Title>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ name });
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
