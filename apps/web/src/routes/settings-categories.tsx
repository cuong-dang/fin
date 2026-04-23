import type { CategoryKind, CategoryWithSubs } from "@fin/schemas";
import { Box, Card, Container, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
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

const CATEGORIES_KEY = ["categories"];

export function SettingsCategoriesRoute() {
  const q = useQuery({ queryKey: CATEGORIES_KEY, queryFn: listCategories });
  const cats = q.data ?? [];
  const income = cats.filter((c) => c.kind === "income");
  const expense = cats.filter((c) => c.kind === "expense");

  return (
    <Container size="sm" py="xl">
      <Stack>
        <BackLink to="/settings" />
        <Box>
          <Title order={2}>Categories</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Income and expense categories organize your transactions. Each
            category can have subcategories for finer grouping.
          </Text>
        </Box>
        <KindSection title="Income" kind="income" categories={income} />
        <KindSection title="Expense" kind="expense" categories={expense} />
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
    <Stack gap="sm" mt="md">
      <Text size="sm" fw={600} tt="uppercase">
        {title}
      </Text>
      <NewNameForm
        placeholder={`New ${kind} category`}
        onSubmit={(name) => createCategory({ kind, name })}
        invalidate={[CATEGORIES_KEY]}
      />
      {cats.length === 0 ? (
        <Text size="sm" c="dimmed" fs="italic">
          No {kind} categories yet.
        </Text>
      ) : (
        <Stack gap="md">
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
    <Card withBorder padding="sm">
      <Stack gap="xs">
        <EditableName
          name={category.name}
          label={`category ${category.name}`}
          onUpdate={(name) => updateCategory(category.id, { name })}
          onDelete={() => deleteCategory(category.id)}
          confirmDeleteMessage={`Delete "${category.name}"? Its subcategories will be removed too. This cannot be undone.`}
          invalidate={[CATEGORIES_KEY]}
        />
        <Stack gap={4} pl="md">
          {category.subcategories.map((s) => (
            <EditableName
              key={s.id}
              name={s.name}
              label={`subcategory ${s.name}`}
              onUpdate={(name) => updateSubcategory(s.id, { name })}
              onDelete={() => deleteSubcategory(s.id)}
              confirmDeleteMessage={`Delete subcategory "${s.name}"? This cannot be undone.`}
              invalidate={[CATEGORIES_KEY]}
            />
          ))}
        </Stack>
        <Box pl="md">
          <NewNameForm
            placeholder="New subcategory"
            onSubmit={(name) => createSubcategory(category.id, { name })}
            invalidate={[CATEGORIES_KEY]}
          />
        </Box>
      </Stack>
    </Card>
  );
}
