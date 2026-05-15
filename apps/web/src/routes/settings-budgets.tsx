import { PageShell } from "@/components/page-shell";
import { SectionHeader } from "@/components/section-header";
import { AddBudgetForm } from "@/features/budgets/add-budget-form";
import { BudgetRow } from "@/features/budgets/budget-row";
import { listAccounts, listBudgets, listCategories } from "@/lib/endpoints";

import type { Budget, CategoryKind, CategoryWithSubs } from "@fin/schemas";
import { Card, Divider, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

const CATEGORIES_KEY = ["categories"];
const BUDGETS_KEY = ["budgets"];
const ACCOUNTS_KEY = ["accounts"];
const INVALIDATE = [BUDGETS_KEY];

/**
 * Settings page for managing budgets. Lists every category /
 * subcategory grouped by kind, with the budgets currently set on
 * each (a target can have multiple budgets, one per currency). The
 * AddBudgetForm appears under each target so the user can stack on
 * another currency without a modal.
 */
export function SettingsBudgetsRoute() {
  const catsQ = useQuery({ queryKey: CATEGORIES_KEY, queryFn: listCategories });
  const budgetsQ = useQuery({ queryKey: BUDGETS_KEY, queryFn: listBudgets });
  const accountsQ = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: listAccounts });

  const cats = catsQ.data ?? [];

  // AddBudgetForm needs a currency choice list. Derive from the
  // workspace's account currencies — same source as the chart page.
  // Depend on `accountsQ.data` (stable ref from the query cache) so
  // the memo doesn't re-run on every render via a fresh `?? []`.
  const currencies = useMemo(() => {
    const seen = new Set<string>();
    for (const a of accountsQ.data ?? []) seen.add(a.currency);
    return [...seen].sort();
  }, [accountsQ.data]);

  // Pre-group budgets by target id for O(1) lookup inside the tree.
  const byCategoryId = useMemo(() => {
    const m = new Map<string, Budget[]>();
    for (const b of budgetsQ.data ?? []) {
      if (b.categoryId === null) continue;
      const arr = m.get(b.categoryId) ?? [];
      arr.push(b);
      m.set(b.categoryId, arr);
    }
    return m;
  }, [budgetsQ.data]);
  const bySubcategoryId = useMemo(() => {
    const m = new Map<string, Budget[]>();
    for (const b of budgetsQ.data ?? []) {
      if (b.subcategoryId === null) continue;
      const arr = m.get(b.subcategoryId) ?? [];
      arr.push(b);
      m.set(b.subcategoryId, arr);
    }
    return m;
  }, [budgetsQ.data]);

  const income = cats.filter((c) => c.kind === "income");
  const expense = cats.filter((c) => c.kind === "expense");

  return (
    <PageShell title="Budgets">
      <Text c="dimmed" size="sm">
        Set spending caps (or income targets) on any category or subcategory.
        Each target can carry one budget per currency. Parent categories with no
        budget of their own roll up the sum of their subcategories on the
        budgets chart.
      </Text>
      <KindSection
        byCategoryId={byCategoryId}
        bySubcategoryId={bySubcategoryId}
        categories={expense}
        currencies={currencies}
        kind="expense"
        title="Expense"
      />
      <KindSection
        byCategoryId={byCategoryId}
        bySubcategoryId={bySubcategoryId}
        categories={income}
        currencies={currencies}
        kind="income"
        title="Income"
      />
    </PageShell>
  );
}

function KindSection({
  title,
  kind,
  categories,
  byCategoryId,
  bySubcategoryId,
  currencies,
}: {
  title: string;
  kind: CategoryKind;
  categories: CategoryWithSubs[];
  byCategoryId: Map<string, Budget[]>;
  bySubcategoryId: Map<string, Budget[]>;
  currencies: string[];
}) {
  return (
    <Stack>
      <SectionHeader>{title}</SectionHeader>
      {categories.length === 0 ? (
        <Text c="dimmed">No {kind} categories.</Text>
      ) : (
        <Stack>
          {categories.map((c) => (
            <CategorySection
              key={c.id}
              budgets={byCategoryId.get(c.id) ?? []}
              category={c}
              currencies={currencies}
              subcategoryBudgets={bySubcategoryId}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function CategorySection({
  category,
  budgets,
  subcategoryBudgets,
  currencies,
}: {
  category: CategoryWithSubs;
  budgets: Budget[];
  subcategoryBudgets: Map<string, Budget[]>;
  currencies: string[];
}) {
  return (
    <Card>
      <Stack>
        <SectionHeader compact>{category.name}</SectionHeader>
        <Stack gap="xs" pl="md">
          {budgets.map((b) => (
            <BudgetRow key={b.id} budget={b} invalidate={INVALIDATE} />
          ))}
          <AddBudgetForm
            currencies={currencies}
            invalidate={INVALIDATE}
            target={{ kind: "category", categoryId: category.id }}
          />
        </Stack>
        {category.subcategories.length > 0 && (
          <>
            <Divider />
            <Stack gap="md" pl="md">
              {category.subcategories.map((s) => {
                const subBudgets = subcategoryBudgets.get(s.id) ?? [];
                return (
                  <Stack key={s.id} gap="xs">
                    <Text fw={500}>{s.name}</Text>
                    {subBudgets.map((b) => (
                      <BudgetRow
                        key={b.id}
                        budget={b}
                        invalidate={INVALIDATE}
                      />
                    ))}
                    <AddBudgetForm
                      currencies={currencies}
                      invalidate={INVALIDATE}
                      target={{ kind: "subcategory", subcategoryId: s.id }}
                    />
                  </Stack>
                );
              })}
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}
