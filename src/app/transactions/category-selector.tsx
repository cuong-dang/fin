"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { CategoryOption } from "./transaction-form";

const CREATE_NEW = "__new__";

/**
 * Category + subcategory picker with inline "Create new…" escape hatches.
 * Controlled: parent owns the selected ids (so they can be reset on
 * transaction-type change). The "+ Create new" option uses a sentinel value;
 * when it's the current selection the surrounding select drops its `name`
 * attr so the server action reads only the new-name text input.
 */
export function CategorySelector({
  categories,
  categoryId,
  onCategoryChange,
  subcategoryId,
  onSubcategoryChange,
}: {
  categories: CategoryOption[];
  categoryId: string;
  onCategoryChange: (value: string) => void;
  subcategoryId: string;
  onSubcategoryChange: (value: string) => void;
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
          name={creatingNewCategory ? undefined : "categoryId"}
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
            name="newCategoryName"
            required
            autoFocus
            maxLength={100}
            placeholder="e.g. Coffee"
          />
        </Field>
      )}

      {creatingNewCategory ? (
        // New category has no existing subs yet — allow naming one inline.
        <Field label="New subcategory (optional)" htmlFor="newSubcategoryName">
          <Input
            id="newSubcategoryName"
            name="newSubcategoryName"
            maxLength={100}
          />
        </Field>
      ) : categoryId === "" ? null : (
        <>
          <Field label="Subcategory (optional)" htmlFor="subcategoryId">
            <NativeSelect
              id="subcategoryId"
              name={creatingNewSubcategory ? undefined : "subcategoryId"}
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
                name="newSubcategoryName"
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
