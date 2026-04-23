import type { CategoryWithSubs } from "@fin/schemas";
import { NativeSelect, TextInput } from "@mantine/core";

export const CREATE_NEW = "__new__";

/**
 * Category + subcategory picker with inline "Create new…" escape hatches.
 */
export function CategorySelector({
  categories,
  categoryId,
  onCategoryChange,
  newCategoryName,
  onNewCategoryNameChange,
  subcategoryId,
  onSubcategoryChange,
  newSubcategoryName,
  onNewSubcategoryNameChange,
}: {
  categories: CategoryWithSubs[];
  categoryId: string;
  onCategoryChange: (v: string) => void;
  newCategoryName: string;
  onNewCategoryNameChange: (v: string) => void;
  subcategoryId: string;
  onSubcategoryChange: (v: string) => void;
  newSubcategoryName: string;
  onNewSubcategoryNameChange: (v: string) => void;
}) {
  const creatingNewCategory = categoryId === CREATE_NEW;
  const selected = categories.find((c) => c.id === categoryId);
  const subcategoriesForPicker = selected?.subcategories ?? [];
  const creatingNewSubcategory = subcategoryId === CREATE_NEW;

  return (
    <>
      <NativeSelect
        label="Category"
        value={categoryId}
        onChange={(e) => {
          onCategoryChange(e.target.value);
          onSubcategoryChange("");
        }}
        required
        data={[
          { value: "", label: "Select…", disabled: true },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
          { value: CREATE_NEW, label: "+ Create new category" },
        ]}
      />
      {creatingNewCategory && (
        <TextInput
          label="New category name"
          value={newCategoryName}
          onChange={(e) => onNewCategoryNameChange(e.target.value)}
          required
          data-autofocus
          maxLength={100}
          placeholder="e.g. Coffee"
        />
      )}

      {creatingNewCategory ? (
        <TextInput
          label="New subcategory (optional)"
          value={newSubcategoryName}
          onChange={(e) => onNewSubcategoryNameChange(e.target.value)}
          maxLength={100}
        />
      ) : categoryId === "" ? null : (
        <>
          <NativeSelect
            label="Subcategory (optional)"
            value={subcategoryId}
            onChange={(e) => onSubcategoryChange(e.target.value)}
            data={[
              { value: "", label: "—" },
              ...subcategoriesForPicker.map((s) => ({
                value: s.id,
                label: s.name,
              })),
              { value: CREATE_NEW, label: "+ Create new subcategory" },
            ]}
          />
          {creatingNewSubcategory && (
            <TextInput
              label="New subcategory name"
              value={newSubcategoryName}
              onChange={(e) => onNewSubcategoryNameChange(e.target.value)}
              required
              data-autofocus
              maxLength={100}
            />
          )}
        </>
      )}
    </>
  );
}
