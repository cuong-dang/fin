import type { AccountGroup } from "@fin/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
      <FormPage>
        <BackLink to="/accounts" />
        <p className="mt-4 text-sm">Group not found.</p>
      </FormPage>
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
    <FormPage>
      <BackLink to="/accounts" />
      <h1 className="mt-4 text-2xl font-semibold">Edit account group</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ name });
        }}
        className="mt-6 space-y-4"
      >
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            maxLength={100}
          />
        </Field>
        {mutation.error && (
          <p className="text-destructive text-sm">
            {(mutation.error as Error).message}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/accounts">Cancel</Link>
          </Button>
        </div>
      </form>
    </FormPage>
  );
}
