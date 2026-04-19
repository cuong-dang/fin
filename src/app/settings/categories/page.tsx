import { BackLink } from "@/components/back-link";
import { FormPage } from "@/components/layout";
import {
  type CategoryWithSubs,
  loadCategoriesWithSubs,
} from "@/lib/categories";
import { getCurrentSession } from "@/lib/session";
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  updateCategory,
  updateSubcategory,
} from "./actions";
import { EditableName } from "./editable-name";
import { NewNameForm } from "./new-name-form";

export default async function CategoriesSettingsPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const cats = await loadCategoriesWithSubs(session.groupId);
  const income = cats.filter((c) => c.kind === "income");
  const expense = cats.filter((c) => c.kind === "expense");

  return (
    <FormPage size="lg">
      <BackLink href="/settings" />
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
  kind: "income" | "expense";
  categories: CategoryWithSubs[];
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold tracking-wider uppercase">
        {title}
      </h2>
      <div className="mt-3">
        <NewNameForm
          action={createCategory.bind(null, kind)}
          placeholder={`New ${kind} category`}
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
          updateAction={updateCategory.bind(null, category.id)}
          deleteAction={deleteCategory.bind(null, category.id)}
          confirmDeleteMessage={`Delete "${category.name}"? Its subcategories will be removed too. This cannot be undone.`}
        />
      </div>
      <ul className="mt-3 space-y-1.5 pl-4">
        {category.subcategories.map((s) => (
          <li key={s.id} className="flex items-center text-sm">
            <EditableName
              name={s.name}
              label={`subcategory ${s.name}`}
              updateAction={updateSubcategory.bind(null, s.id)}
              deleteAction={deleteSubcategory.bind(null, s.id)}
              confirmDeleteMessage={`Delete subcategory "${s.name}"? This cannot be undone.`}
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 pl-4">
        <NewNameForm
          action={createSubcategory.bind(null, category.id)}
          placeholder="New subcategory"
        />
      </div>
    </li>
  );
}
