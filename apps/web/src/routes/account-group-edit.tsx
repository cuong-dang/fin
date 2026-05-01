import type { AccountGroup } from "@fin/schemas";
import { Alert, Button, Group, Stack, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { PageShell } from "@/components/page-shell";
import { listAccountGroups, updateAccountGroup } from "@/lib/endpoints";

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
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);

  // Save / Cancel / Back return to wherever the user came from instead
  // of dumping at /accounts. `navigate(-1)` pops one history entry.
  const goBack = () => navigate(-1);

  const mutation = useMutation({
    mutationFn: (body: { name: string }) => updateAccountGroup(group.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      goBack();
    },
  });

  return (
    <PageShell back={goBack} title="Edit account group">
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
