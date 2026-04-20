import type { CategoryKind, CategoryWithSubs } from "@fin/schemas";
import { useQuery } from "@tanstack/react-query";
import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import { EditableName } from "@/features/settings/editable-name";
import { NewNameForm } from "@/features/settings/new-name-form";
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  listCategories,
  updateCategory,
  updateSubcategory,
} from "@/lib/endpoints";

const CATEGORIES_KEY = ["categories"];

export function SettingsCategoriesRoute() {
  const q = useQuery({ queryKey: CATEGORIES_KEY, queryFn: listCategories });
  const cats = q.data ?? [];
  const income = cats.filter((c) => c.kind === "income");
  const expense = cats.filter((c) => c.kind === "expense");

  return (
    <FormPage size="lg">
      <BackLink to="/settings" />
      <h1 className="mt-4 text-2xl font-semibold">Categories</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Income and expense categories organize your transactions. Each category
        can have subcategories for finer grouping.
      </p>
      <KindSection title="Income" kind="income" categories={income} />
      <KindSection title="Expense" kind="expense" categories={expense} />
    </FormPage>
  );
}

function KindSection({
  title,
  kind,
  categories: cats,
}: {
  title: string;
  kind: CategoryKind;
  categories: CategoryWithSubs[];
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold tracking-wider uppercase">
        {title}
      </h2>
      <div className="mt-3">
        <NewNameForm
          placeholder={`New ${kind} category`}
          onSubmit={(name) => createCategory({ kind, name })}
          invalidate={[CATEGORIES_KEY]}
        />
      </div>
      {cats.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm italic">
          No {kind} categories yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-4">
          {cats.map((c) => (
            <CategorySection key={c.id} category={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CategorySection({ category }: { category: CategoryWithSubs }) {
  return (
    <li className="border-border rounded-md border p-3">
      <div className="flex items-center">
        <EditableName
          name={category.name}
          label={`category ${category.name}`}
          onUpdate={(name) => updateCategory(category.id, { name })}
          onDelete={() => deleteCategory(category.id)}
          confirmDeleteMessage={`Delete "${category.name}"? Its subcategories will be removed too. This cannot be undone.`}
          invalidate={[CATEGORIES_KEY]}
        />
      </div>
      <ul className="mt-3 space-y-1.5 pl-4">
        {category.subcategories.map((s) => (
          <li key={s.id} className="flex items-center text-sm">
            <EditableName
              name={s.name}
              label={`subcategory ${s.name}`}
              onUpdate={(name) => updateSubcategory(s.id, { name })}
              onDelete={() => deleteSubcategory(s.id)}
              confirmDeleteMessage={`Delete subcategory "${s.name}"? This cannot be undone.`}
              invalidate={[CATEGORIES_KEY]}
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 pl-4">
        <NewNameForm
          placeholder="New subcategory"
          onSubmit={(name) => createSubcategory(category.id, { name })}
          invalidate={[CATEGORIES_KEY]}
        />
      </div>
    </li>
  );
}
