import { PageShell } from "@/components/page-shell";
import { BillForm } from "@/features/bills/bill-form";
import {
  createBill,
  listAccounts,
  listCategories,
  listTags,
} from "@/lib/endpoints";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

export function BillNewRoute() {
  const qc = useQueryClient();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });

  const navigate = useNavigate();
  const goBack = () => navigate(-1);

  const mutation = useMutation({
    mutationFn: createBill,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      goBack();
    },
  });

  if (accountsQ.isLoading || categoriesQ.isLoading || tagsQ.isLoading) {
    return null;
  }

  return (
    <PageShell title="New bill">
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
