import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { PageShell } from "@/components/page-shell";
import { TransactionForm } from "@/features/transactions/transaction-form";
import {
  createTransaction,
  listAccounts,
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
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: listTags });

  const mutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      navigate("/");
    },
  });

  if (accountsQ.isLoading || categoriesQ.isLoading || tagsQ.isLoading) {
    return null;
  }

  return (
    <PageShell back="/" title="New transaction">
      <TransactionForm
        accounts={accountsQ.data ?? []}
        categories={categoriesQ.data ?? []}
        error={mutation.error ? (mutation.error as Error).message : null}
        pending={mutation.isPending}
        submitLabel="Add"
        tags={tagsQ.data ?? []}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </PageShell>
  );
}
