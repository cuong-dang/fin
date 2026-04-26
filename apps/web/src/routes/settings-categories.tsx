import type { CategoryKind, CategoryWithSubs, Tag } from "@fin/schemas";
import { Box, Card, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/page-shell";
import { SectionHeader } from "@/components/section-header";
import { EditableName } from "@/features/settings/editable-name";
import { NewNameForm } from "@/features/settings/new-name-form";
import {
  createCategory,
  createSubcategory,
  createTag,
  deleteCategory,
  deleteSubcategory,
  deleteTag,
  listCategories,
  listTags,
  updateCategory,
  updateSubcategory,
  updateTag,
} from "@/lib/endpoints";

const CATEGORIES_KEY = ["categories"];
const TAGS_KEY = ["tags"];

export function SettingsCategoriesRoute() {
  const catsQ = useQuery({ queryKey: CATEGORIES_KEY, queryFn: listCategories });
  const tagsQ = useQuery({ queryKey: TAGS_KEY, queryFn: listTags });
  const cats = catsQ.data ?? [];
  const income = cats.filter((c) => c.kind === "income");
  const expense = cats.filter((c) => c.kind === "expense");
  const tags = tagsQ.data ?? [];

  return (
    <PageShell
      back="/settings"
      subtitle="Categories organize transactions; tags add a free-form second axis. Lines can carry multiple tags."
      title="Categories & tags"
    >
      <KindSection categories={income} kind="income" title="Income" />
      <KindSection categories={expense} kind="expense" title="Expense" />
      <TagsSection tags={tags} />
    </PageShell>
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
    <Stack>
      <SectionHeader>{title}</SectionHeader>
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
      <Stack>
        <EditableName
          confirmDeleteMessage={`Delete "${category.name}"? Its subcategories will be removed too. This cannot be undone.`}
          invalidate={[CATEGORIES_KEY]}
          label={`category ${category.name}`}
          name={category.name}
          onDelete={() => deleteCategory(category.id)}
          onUpdate={(name) => updateCategory(category.id, { name })}
        />
        <Stack pl="md">
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

function TagsSection({ tags }: { tags: Tag[] }) {
  return (
    <Stack>
      <SectionHeader>Tags</SectionHeader>
      <NewNameForm
        invalidate={[TAGS_KEY]}
        placeholder="New tag"
        onSubmit={(name) => createTag({ name })}
      />
      {tags.length === 0 ? (
        <Text c="dimmed" size="sm">
          No tags.
        </Text>
      ) : (
        <Card padding="sm" withBorder>
          <Stack>
            {tags.map((t) => (
              <EditableName
                key={t.id}
                confirmDeleteMessage={`Delete tag "${t.name}"? It will be removed from any transactions that used it. This cannot be undone.`}
                invalidate={[TAGS_KEY]}
                label={`tag ${t.name}`}
                name={t.name}
                onDelete={() => deleteTag(t.id)}
                onUpdate={(name) => updateTag(t.id, { name })}
              />
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
