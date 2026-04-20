import type { CategoryWithSubs } from "@fin/schemas";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export const CREATE_NEW = "__new__";

/**
 * Category + subcategory picker with inline "Create new…" escape hatches.
 * Controlled: parent owns state so it can reset on transaction-type change.
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
      <Field label="Category" htmlFor="categoryId">
        <NativeSelect
          id="categoryId"
          value={categoryId}
          onChange={(e) => {
            onCategoryChange(e.target.value);
            onSubcategoryChange("");
          }}
          required
        >
          <option value="" disabled>
            Select…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={CREATE_NEW}>+ Create new category</option>
        </NativeSelect>
      </Field>
      {creatingNewCategory && (
        <Field label="New category name" htmlFor="newCategoryName">
          <Input
            id="newCategoryName"
            value={newCategoryName}
            onChange={(e) => onNewCategoryNameChange(e.target.value)}
            required
            autoFocus
            maxLength={100}
            placeholder="e.g. Coffee"
          />
        </Field>
      )}

      {creatingNewCategory ? (
        <Field label="New subcategory (optional)" htmlFor="newSubcategoryName">
          <Input
            id="newSubcategoryName"
            value={newSubcategoryName}
            onChange={(e) => onNewSubcategoryNameChange(e.target.value)}
            maxLength={100}
          />
        </Field>
      ) : categoryId === "" ? null : (
        <>
          <Field label="Subcategory (optional)" htmlFor="subcategoryId">
            <NativeSelect
              id="subcategoryId"
              value={subcategoryId}
              onChange={(e) => onSubcategoryChange(e.target.value)}
            >
              <option value="">—</option>
              {subcategoriesForPicker.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={CREATE_NEW}>+ Create new subcategory</option>
            </NativeSelect>
          </Field>
          {creatingNewSubcategory && (
            <Field label="New subcategory name" htmlFor="newSubcategoryName">
              <Input
                id="newSubcategoryName"
                value={newSubcategoryName}
                onChange={(e) => onNewSubcategoryNameChange(e.target.value)}
                required
                autoFocus
                maxLength={100}
              />
            </Field>
          )}
        </>
      )}
    </>
  );
}
