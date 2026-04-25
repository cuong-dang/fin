import { BackLink } from "@/components/back-link";
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
import type { CategoryKind, CategoryWithSubs } from "@fin/schemas";
import { Box, Card, Container, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

const CATEGORIES_KEY = ["categories"];

export function SettingsCategoriesRoute() {
  const q = useQuery({ queryKey: CATEGORIES_KEY, queryFn: listCategories });
  const cats = q.data ?? [];
  const income = cats.filter((c) => c.kind === "income");
  const expense = cats.filter((c) => c.kind === "expense");

  return (
    <Container>
      <Stack>
        <BackLink to="/settings" />
        <Box>
          <Title order={2}>Categories</Title>
          <Text c="dimmed" size="sm">
            Income and expense categories organize your transactions. Each
            category can have subcategories for finer grouping.
          </Text>
        </Box>
        <KindSection categories={income} kind="income" title="Income" />
        <KindSection categories={expense} kind="expense" title="Expense" />
      </Stack>
    </Container>
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
    <Stack gap="sm">
      <Text fw={700} size="sm" tt="uppercase">
        {title}
      </Text>
      <NewNameForm
        invalidate={[CATEGORIES_KEY]}
        placeholder={`New ${kind} category`}
        onSubmit={(name) => createCategory({ kind, name })}
      />
      {cats.length === 0 ? (
        <Text c="dimmed" size="sm">
          No {kind} categories.
        </Text>
      ) : (
        <Stack>
          {cats.map((c) => (
            <CategorySection key={c.id} category={c} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function CategorySection({ category }: { category: CategoryWithSubs }) {
  return (
    <Card padding="sm" withBorder>
      <Stack gap="xs">
        <EditableName
          confirmDeleteMessage={`Delete "${category.name}"? Its subcategories will be removed too. This cannot be undone.`}
          invalidate={[CATEGORIES_KEY]}
          label={`category ${category.name}`}
          name={category.name}
          onDelete={() => deleteCategory(category.id)}
          onUpdate={(name) => updateCategory(category.id, { name })}
        />
        <Stack gap={0} pl="md">
          {category.subcategories.map((s) => (
            <EditableName
              key={s.id}
              confirmDeleteMessage={`Delete subcategory "${s.name}"? This cannot be undone.`}
              invalidate={[CATEGORIES_KEY]}
              label={`subcategory ${s.name}`}
              name={s.name}
              onDelete={() => deleteSubcategory(s.id)}
              onUpdate={(name) => updateSubcategory(s.id, { name })}
            />
          ))}
        </Stack>
        <Box pl="md">
          <NewNameForm
            invalidate={[CATEGORIES_KEY]}
            placeholder="New subcategory"
            onSubmit={(name) => createSubcategory(category.id, { name })}
          />
        </Box>
      </Stack>
    </Card>
  );
}
