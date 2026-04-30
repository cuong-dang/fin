import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { PageShell } from "@/components/page-shell";
import { TransactionForm } from "@/features/transactions/transaction-form";
import {
  createTransaction,
  listAccounts,
  listBills,
  listCategories,
  listTags,
} from "@/lib/endpoints";

export function TransactionNewRoute() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });
  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });
  const billsQ = useQuery({
    queryKey: ["bills"],
    queryFn: listBills,
  });

  // Add / Cancel / Back all return to wherever the user came from
  // (charts, transactions list, an account page, etc.) instead of
  // dumping them at the root. `navigate(-1)` pops one history entry.
  const goBack = () => navigate(-1);

  const mutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      goBack();
    },
  });

  if (
    accountsQ.isLoading ||
    categoriesQ.isLoading ||
    tagsQ.isLoading ||
    billsQ.isLoading
  ) {
    return null;
  }

  return (
    <PageShell back={goBack} title="New transaction">
      <TransactionForm
        accounts={accountsQ.data ?? []}
        bills={billsQ.data ?? []}
        categories={categoriesQ.data ?? []}
        error={mutation.error ? (mutation.error as Error).message : null}
        pending={mutation.isPending}
        submitLabel="Save"
        tags={tagsQ.data ?? []}
        onCancel={goBack}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </PageShell>
  );
}
