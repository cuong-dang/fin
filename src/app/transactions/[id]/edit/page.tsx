import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { FormPage } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { transactions } from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { getCurrentSession } from "@/lib/session";
import { deleteTransaction, updateTransaction } from "../../actions";

// Format a Date as "YYYY-MM-DDTHH:mm" in local time, matching what
// <input type="datetime-local"> expects and emits.
function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return null;

  const tx = await findOwned(transactions, id, session.groupId);
  if (!tx) notFound();

  const boundUpdate = updateTransaction.bind(null, id);
  const boundDelete = deleteTransaction.bind(null, id);

  return (
    <FormPage>
      <BackLink href="/" />
      <h1 className="mt-4 text-2xl font-semibold">Edit transaction</h1>
      <p className="text-muted-foreground mt-1 text-sm capitalize">{tx.type}</p>

      <form action={boundUpdate} className="mt-6 space-y-4">
        <Field label="Date & time" htmlFor="timestamp">
          <Input
            id="timestamp"
            type="datetime-local"
            name="timestamp"
            required
            defaultValue={toLocalDateTimeInput(tx.timestamp)}
          />
        </Field>
        <Field label="Description" htmlFor="description">
          <Input
            id="description"
            type="text"
            name="description"
            maxLength={500}
            defaultValue={tx.description ?? ""}
          />
        </Field>
        <Button type="submit">Save</Button>
      </form>

      <div className="mt-12 border-t pt-6">
        <h2 className="text-sm font-semibold">Danger zone</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Deleting removes this transaction along with its legs and lines.
        </p>
        <div className="mt-3">
          <ConfirmDeleteButton
            action={boundDelete}
            confirmMessage="Delete this transaction? Its legs and lines will also be removed. This cannot be undone."
            label="Delete transaction"
          />
        </div>
      </div>
    </FormPage>
  );
}
