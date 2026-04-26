import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { PageShell } from "@/components/page-shell";
import { SubscriptionForm } from "@/features/subscriptions/subscription-form";
import {
  createSubscription,
  listAccounts,
  listCategories,
  listTags,
} from "@/lib/endpoints";

export function SubscriptionNewRoute() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: listTags });

  const mutation = useMutation({
    mutationFn: createSubscription,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      navigate("/settings/subscriptions");
    },
  });

  if (accountsQ.isLoading || categoriesQ.isLoading || tagsQ.isLoading) {
    return null;
  }

  return (
    <PageShell back="/settings/subscriptions" title="New subscription">
      <SubscriptionForm
        accounts={accountsQ.data ?? []}
        categories={categoriesQ.data ?? []}
        error={mutation.error ? (mutation.error as Error).message : null}
        pending={mutation.isPending}
        submitLabel="Create"
        tags={tagsQ.data ?? []}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </PageShell>
  );
}
