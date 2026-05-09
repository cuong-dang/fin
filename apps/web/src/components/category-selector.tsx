import type { CategoryWithSubs } from "@fin/schemas";

import { CreatableSelect } from "./creatable-select";

/**
 * Category + subcategory picker with implicit-create UX. Each axis
 * renders a `Combobox` (search-as-you-type + dropdown):
 *   - typing filters the list of existing options
 *   - if no exact match exists for the typed text, a "+ Create '…'"
 *     entry surfaces at the top of the dropdown
 *   - clicking either an existing option or the "+ Create…" entry
 *     commits the value; leaving the field with non-matching text
 *     also commits to create (the form state already has the typed
 *     text under `newCategoryName`).
 */
export function CategorySelector({
  categories,
  categoryId,
  setCategoryId,
  newCategoryName,
  setNewCategoryName,
  subcategoryId,
  setSubcategoryId,
  newSubcategoryName,
  setNewSubcategoryName,
}: {
  categories: CategoryWithSubs[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  newCategoryName: string;
  setNewCategoryName: (v: string) => void;
  subcategoryId: string;
  setSubcategoryId: (v: string) => void;
  newSubcategoryName: string;
  setNewSubcategoryName: (v: string) => void;
}) {
  const creatingNewCategory = categoryId === "";

  const categoryText =
    categories.find((c) => c.id === categoryId)?.name ?? newCategoryName;

  function handleCategoryText(text: string) {
    const match = categories.find((c) => c.name === text);
    if (match) {
      setCategoryId(match.id);
      setNewCategoryName("");
    } else {
      setCategoryId("");
      setNewCategoryName(text);
    }
    // Switching the category invalidates any subcategory selection
    // tied to the previous category.
    setSubcategoryId("");
    setNewSubcategoryName("");
  }

  const subcategoriesForPicker =
    categories.find((c) => c.id === categoryId)?.subcategories ?? [];

  const subcategoryText =
    subcategoriesForPicker.find((s) => s.id === subcategoryId)?.name ??
    newSubcategoryName;

  function handleSubcategoryText(text: string) {
    if (creatingNewCategory) {
      // No existing subcategories under a yet-to-be-created category;
      // any text is "create new" by definition.
      setSubcategoryId("");
      setNewSubcategoryName(text);
      return;
    }
    const match = subcategoriesForPicker.find((s) => s.name === text);
    if (match) {
      setSubcategoryId(match.id);
      setNewSubcategoryName("");
    } else {
      setSubcategoryId("");
      setNewSubcategoryName(text);
    }
  }

  return (
    <>
      <CreatableSelect
        data={categories.map((c) => c.name)}
        label="Category"
        placeholder="Select or type to create…"
        required
        value={categoryText}
        onChange={handleCategoryText}
      />
      {(creatingNewCategory || categoryId !== "") && (
        <CreatableSelect
          data={
            creatingNewCategory ? [] : subcategoriesForPicker.map((s) => s.name)
          }
          label="Subcategory (optional)"
          placeholder="Select or type to create…"
          value={subcategoryText}
          onChange={handleSubcategoryText}
        />
      )}
    </>
  );
}
