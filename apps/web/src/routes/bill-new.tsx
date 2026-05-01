import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { PageShell } from "@/components/page-shell";
import { BillForm } from "@/features/bills/bill-form";
import {
  createBill,
  listAccounts,
  listCategories,
  listTags,
} from "@/lib/endpoints";

export function BillNewRoute() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });

  // Create / Cancel / Back all return to wherever the user came from
  // (settings, charts, transactions list, etc.) instead of dumping at
  // /settings/bills. `navigate(-1)` pops one history entry.
  const goBack = () => navigate(-1);

  const mutation = useMutation({
    mutationFn: createBill,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      goBack();
    },
  });

  if (accountsQ.isLoading || categoriesQ.isLoading || tagsQ.isLoading) {
    return null;
  }

  return (
    <PageShell back={goBack} title="New bill">
      <BillForm
        accounts={accountsQ.data ?? []}
        categories={categoriesQ.data ?? []}
        error={mutation.error ? (mutation.error as Error).message : null}
        pending={mutation.isPending}
        submitLabel="Create"
        tags={tagsQ.data ?? []}
        onCancel={goBack}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </PageShell>
  );
}
