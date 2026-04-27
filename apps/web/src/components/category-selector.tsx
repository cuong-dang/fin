import type { CategoryWithSubs } from "@fin/schemas";
import { NativeSelect, TextInput } from "@mantine/core";

const CREATE_NEW = "__new__";

/**
 * Category + subcategory picker with inline "Create new…" escape hatches.
 * Used by transaction lines and subscription default lines (and later
 * recurring-plan default lines).
 *
 * The pickers store the sentinel `CREATE_NEW` in the *Id field while the
 * companion text input collects the new name. `packCategoryLine` below
 * handles the form → request-body conversion symmetrically.
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
        data={[
          { value: "", label: "Select…", disabled: true },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
          { value: CREATE_NEW, label: "+ Create new category" },
        ]}
        label="Category"
        required
        value={categoryId}
        onChange={(e) => {
          onCategoryChange(e.target.value);
          onSubcategoryChange("");
        }}
      />
      {creatingNewCategory && (
        <TextInput
          data-autofocus
          label="New category name"
          maxLength={100}
          placeholder="e.g. Coffee"
          required
          value={newCategoryName}
          onChange={(e) => onNewCategoryNameChange(e.target.value)}
        />
      )}

      {creatingNewCategory ? (
        <TextInput
          label="New subcategory (optional)"
          maxLength={100}
          value={newSubcategoryName}
          onChange={(e) => onNewSubcategoryNameChange(e.target.value)}
        />
      ) : categoryId === "" ? null : (
        <>
          <NativeSelect
            data={[
              { value: "", label: "—" },
              ...subcategoriesForPicker.map((s) => ({
                value: s.id,
                label: s.name,
              })),
              { value: CREATE_NEW, label: "+ Create new subcategory" },
            ]}
            label="Subcategory (optional)"
            value={subcategoryId}
            onChange={(e) => onSubcategoryChange(e.target.value)}
          />
          {creatingNewSubcategory && (
            <TextInput
              data-autofocus
              label="New subcategory name"
              maxLength={100}
              required
              value={newSubcategoryName}
              onChange={(e) => onNewSubcategoryNameChange(e.target.value)}
            />
          )}
        </>
      )}
    </>
  );
}

/**
 * The form state for one categorizable line. Both transaction lines and
 * subscription default lines (and later recurring-plan default lines)
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
 * `subscriptionDefaultLineBody`.
 */
type CategoryLineBody = {
  amount: string;
  categoryId?: string;
  newCategoryName?: string;
  subcategoryId?: string;
  newSubcategoryName?: string;
  tagNames?: string[];
};

/**
 * Convert a form line to its request-body shape. Encapsulates the
 * `CREATE_NEW` sentinel handling so each form doesn't reinvent it.
 */
export function packCategoryLine(l: CategoryLineFormValues): CategoryLineBody {
  const creatingCategory = l.categoryId === CREATE_NEW;
  return {
    amount: l.amount,
    categoryId: creatingCategory ? undefined : l.categoryId || undefined,
    newCategoryName: creatingCategory ? l.newCategoryName : undefined,
    subcategoryId:
      creatingCategory || l.subcategoryId === CREATE_NEW
        ? undefined
        : l.subcategoryId || undefined,
    newSubcategoryName: creatingCategory
      ? l.newSubcategoryName || undefined
      : l.subcategoryId === CREATE_NEW
        ? l.newSubcategoryName
        : undefined,
    tagNames: l.tagNames.length > 0 ? l.tagNames : undefined,
  };
}
