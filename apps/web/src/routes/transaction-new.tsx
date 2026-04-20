import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
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
  const [error, setError] = useState<string | null>(null);

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
    onError: (e) => setError((e as Error).message),
  });

  if (accountsQ.isLoading || categoriesQ.isLoading || tagsQ.isLoading) {
    return null;
  }

  return (
    <FormPage size="lg">
      <BackLink to="/" />
      <h1 className="mt-4 mb-6 text-2xl font-semibold">New transaction</h1>
      <TransactionForm
        accounts={accountsQ.data ?? []}
        categories={categoriesQ.data ?? []}
        tags={tagsQ.data ?? []}
        title="New transaction"
        submitLabel="Create transaction"
        onSubmit={(body) => {
          setError(null);
          mutation.mutate(body);
        }}
        pending={mutation.isPending}
        error={error}
      />
    </FormPage>
  );
}
