import type { CategoryWithSubs } from "@fin/schemas";

import { CreatableSelect } from "./creatable-select";

const CREATE_NEW = "__new__";

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
  const creatingNewCategory = categoryId === CREATE_NEW;

  const categoryText =
    categories.find((c) => c.id === categoryId)?.name ?? newCategoryName;

  function handleCategoryText(text: string) {
    const match = categories.find((c) => c.name === text);
    if (match) {
      setCategoryId(match.id);
      setNewCategoryName("");
    } else {
      setCategoryId(text ? CREATE_NEW : "");
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
      setSubcategoryId(text ? CREATE_NEW : "");
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

/**
 * The form state for one categorizable line. Both transaction lines and
 * bill default lines (and later recurring-plan default lines)
 * use this exact shape.
 */
export type CategoryLineFormValues = {
  amount: string;
  categoryId: string; // may be CREATE_NEW
  newCategoryName: string;
  subcategoryId: string; // may be CREATE_NEW
  newSubcategoryName: string;
  tagNames: string[];
};

/**
 * Server-bound shape for one line — `categoryId`/`subcategoryId` UUIDs
 * when picking existing rows, `newCategoryName`/`newSubcategoryName`
 * strings when the user typed a new name. `tagNames` are upserted
 * server-side. Mirrors `transactionLineBody` and
 * `billDefaultLineBody`. `amount` is optional here so empty
 * values pack cleanly for sub / loan default lines whose Zod schemas
 * mark amount optional; required-amount schemas (transactions) reject
 * the missing field at parse time with a clear required-field error.
 */
type CategoryLineBody = {
  amount?: string | undefined;
  categoryId?: string | undefined;
  newCategoryName?: string | undefined;
  subcategoryId?: string | undefined;
  newSubcategoryName?: string | undefined;
  tagNames?: string[] | undefined;
};

/**
 * Convert a form line to its request-body shape. Encapsulates the
 * `CREATE_NEW` sentinel handling so each form doesn't reinvent it.
 */
export function packCategoryLine(l: CategoryLineFormValues): CategoryLineBody {
  const creatingCategory = l.categoryId === CREATE_NEW;
  return {
    amount: l.amount || undefined,
    categoryId: creatingCategory ? undefined : l.categoryId || undefined,
    newCategoryName: creatingCategory ? l.newCategoryName.trim() : undefined,
    subcategoryId:
      creatingCategory || l.subcategoryId === CREATE_NEW
        ? undefined
        : l.subcategoryId || undefined,
    newSubcategoryName: creatingCategory
      ? l.newSubcategoryName.trim() || undefined
      : l.subcategoryId === CREATE_NEW
        ? l.newSubcategoryName.trim()
        : undefined,
    tagNames: l.tagNames.length > 0 ? l.tagNames : undefined,
  };
}
