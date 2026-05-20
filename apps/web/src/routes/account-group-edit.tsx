import { PageShell } from "@/components/page-shell";
import { listAccountGroups, updateAccountGroup } from "@/lib/endpoints";

import type { AccountGroup } from "@fin/schemas";
import { Alert, Button, Group, Stack, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { NotFoundRoute } from "./not-found";

export function AccountGroupEditRoute() {
  const { id } = useParams<{ id: string }>();
  const groupsQ = useQuery({
    queryKey: ["account-groups"],
    queryFn: listAccountGroups,
  });
  const group = groupsQ.data?.find((g) => g.id === id);
  if (groupsQ.isLoading) return null;
  if (!group) return <NotFoundRoute />;
  return <Form group={group} />;
}

function Form({ group }: { group: AccountGroup }) {
  const navigate = useNavigate();
  const goBack = () => navigate(-1);
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);

  const mutation = useMutation({
    mutationFn: (body: { name: string }) => updateAccountGroup(group.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      goBack();
    },
  });

  return (
    <PageShell title="Edit account group" withBackLink={false}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ name });
        }}
      >
        <Stack>
          <TextInput
            data-autofocus
            label="Name"
            maxLength={100}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {mutation.error && (
            <Alert color="red">{(mutation.error as Error).message}</Alert>
          )}
          <Group>
            <Button loading={mutation.isPending} type="submit">
              Save
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
