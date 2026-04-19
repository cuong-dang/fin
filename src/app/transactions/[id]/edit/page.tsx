import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { FormPage } from "@/components/layout";
import { db } from "@/db";
import {
  accounts,
  transactionLegs,
  transactionLines,
  transactions,
} from "@/db/schema";
import { findOwned } from "@/lib/authz";
import { formatMoneyPlain } from "@/lib/money";
import { getCurrentSession } from "@/lib/session";
import { loadTransactionFormOptions } from "../../form-options";
import {
  type InitialTxValues,
  TransactionForm,
} from "../../transaction-form";
import {
  deleteTransaction,
  updateAdjustmentTransaction,
  updateTransaction,
} from "./actions";
import { AdjustmentEditForm } from "./adjustment-edit-form";

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

  // Load legs + lines for this transaction to derive initial form values.
  const [legRows, lineRows] = await Promise.all([
    db
      .select({
        id: transactionLegs.id,
        accountId: transactionLegs.accountId,
        amount: transactionLegs.amount,
        currency: accounts.currency,
      })
      .from(transactionLegs)
      .innerJoin(accounts, eq(accounts.id, transactionLegs.accountId))
      .where(eq(transactionLegs.transactionId, id)),
    db
      .select({
        categoryId: transactionLines.categoryId,
        subcategoryId: transactionLines.subcategoryId,
        tagId: transactionLines.tagId,
        amount: transactionLines.amount,
        currency: transactionLines.currency,
      })
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, id)),
  ]);

  const boundDelete = deleteTransaction.bind(null, id);

  // ─── Adjustment: limited edit (date + description + signed amount) ──────
  if (tx.type === "adjustment") {
    const leg = legRows[0];
    if (!leg) throw new Error(`Invariant: adjustment ${id} has no leg`);
    return (
      <FormPage>
        <BackLink href="/" />
        <h1 className="mt-4 text-2xl font-semibold">Edit transaction</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Balance adjustment
        </p>
        <AdjustmentEditForm
          action={updateAdjustmentTransaction.bind(null, id)}
          initial={{
            date: tx.date,
            amount: formatMoneyPlain(leg.amount, leg.currency),
            description: tx.description ?? "",
          }}
        />
        <DangerZone boundDelete={boundDelete} />
      </FormPage>
    );
  }

  // ─── Income / expense / transfer: full edit ─────────────────────────────
  const options = await loadTransactionFormOptions(session.groupId);

  const initialValues = deriveInitialValues(
    tx.type,
    tx.date,
    tx.description ?? "",
    legRows,
    lineRows,
  );

  return (
    <>
      <TransactionForm
        accounts={options.accounts}
        categories={options.categories}
        tags={options.tags}
        action={updateTransaction.bind(null, id)}
        title="Edit transaction"
        submitLabel="Save"
        initialValues={initialValues}
      />
      <FormPage size="lg">
        <DangerZone boundDelete={boundDelete} />
      </FormPage>
    </>
  );
}

function deriveInitialValues(
  type: "income" | "expense" | "transfer",
  date: string,
  description: string,
  legs: Array<{ accountId: string; amount: bigint; currency: string }>,
  lines: Array<{
    categoryId: string;
    subcategoryId: string | null;
    tagId: string | null;
    amount: bigint;
    currency: string;
  }>,
): InitialTxValues {
  const base: InitialTxValues = {
    type,
    date,
    amount: "",
    description,
    accountId: "",
    destinationAccountId: "",
    categoryId: "",
    subcategoryId: "",
    tagId: "",
  };

  if (type === "transfer") {
    const outLeg = legs.find((l) => l.amount < 0n);
    const inLeg = legs.find((l) => l.amount > 0n);
    if (!outLeg || !inLeg) {
      throw new Error("Invariant: transfer missing in/out leg");
    }
    return {
      ...base,
      amount: formatMoneyPlain(inLeg.amount, inLeg.currency),
      accountId: outLeg.accountId,
      destinationAccountId: inLeg.accountId,
    };
  }

  const leg = legs[0];
  const line = lines[0];
  if (!leg) throw new Error("Invariant: income/expense missing leg");
  if (!line) throw new Error("Invariant: income/expense missing line");
  return {
    ...base,
    amount: formatMoneyPlain(line.amount, line.currency),
    accountId: leg.accountId,
    categoryId: line.categoryId,
    subcategoryId: line.subcategoryId ?? "",
    tagId: line.tagId ?? "",
  };
}

function DangerZone({
  boundDelete,
}: {
  boundDelete: () => Promise<void>;
}) {
  return (
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
  );
}
