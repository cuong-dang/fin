import { getCurrentSession } from "@/lib/session";
import { loadTransactionFormOptions } from "../form-options";
import { TransactionForm } from "../transaction-form";
import { createTransaction } from "./actions";

export default async function NewTransactionPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const options = await loadTransactionFormOptions(session.groupId);

  return (
    <TransactionForm
      accounts={options.accounts}
      categories={options.categories}
      tags={options.tags}
      action={createTransaction}
      title="New transaction"
      submitLabel="Create transaction"
    />
  );
}
