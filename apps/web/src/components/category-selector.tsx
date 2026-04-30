import type { CategoryWithSubs } from "@fin/schemas";
import { Combobox, InputBase, useCombobox } from "@mantine/core";
import { useMemo } from "react";

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
 *
 * The component preserves the parent state contract used since the
 * NativeSelect days: `categoryId` is either a real UUID, "", or the
 * `CREATE_NEW` sentinel, paired with `newCategoryName` text. Internally
 * we derive a single display string and translate user input back into
 * that shape — case-insensitive name matching maps "food" to an
 * existing "Food" rather than queueing a duplicate create.
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
  // Memoize so the array identity is stable across renders — the
  // useMemo hooks below depend on it, and a fresh `[]` fallback every
  // render would invalidate them spuriously (lint catches this).
  const subcategoriesForPicker = useMemo(() => {
    const selected = categories.find((c) => c.id === categoryId);
    return selected?.subcategories ?? [];
  }, [categories, categoryId]);
  const creatingNewCategory = categoryId === CREATE_NEW;

  // Display string for the category combobox: real-id → that category's
  // name; CREATE_NEW or empty → the user's typed `newCategoryName`.
  const categoryText = useMemo(() => {
    if (categoryId && categoryId !== CREATE_NEW) {
      return categories.find((c) => c.id === categoryId)?.name ?? "";
    }
    return newCategoryName;
  }, [categoryId, newCategoryName, categories]);

  function handleCategoryText(text: string) {
    const trimmed = text.trim();
    const match = categories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) {
      onCategoryChange(match.id);
      onNewCategoryNameChange("");
    } else {
      onCategoryChange(trimmed ? CREATE_NEW : "");
      onNewCategoryNameChange(text);
    }
    // Switching the category invalidates any subcategory selection
    // tied to the previous category.
    onSubcategoryChange("");
    onNewSubcategoryNameChange("");
  }

  // Subcategory display: real-id → that subcategory's name; CREATE_NEW
  // or while creating-new-category → the typed `newSubcategoryName`.
  const subcategoryText = useMemo(() => {
    if (!creatingNewCategory && subcategoryId && subcategoryId !== CREATE_NEW) {
      return (
        subcategoriesForPicker.find((s) => s.id === subcategoryId)?.name ?? ""
      );
    }
    return newSubcategoryName;
  }, [
    creatingNewCategory,
    subcategoryId,
    newSubcategoryName,
    subcategoriesForPicker,
  ]);

  function handleSubcategoryText(text: string) {
    const trimmed = text.trim();
    if (creatingNewCategory) {
      // No existing subcategories under a yet-to-be-created category;
      // any text is "create new" by definition.
      onSubcategoryChange("");
      onNewSubcategoryNameChange(text);
      return;
    }
    const match = subcategoriesForPicker.find(
      (s) => s.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) {
      onSubcategoryChange(match.id);
      onNewSubcategoryNameChange("");
    } else {
      onSubcategoryChange(trimmed ? CREATE_NEW : "");
      onNewSubcategoryNameChange(text);
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
          // While creating a new category, no existing subcategories
          // exist for it — `data=[]` keeps the dropdown empty and the
          // typed text always lands as "+ Create…".
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
 * Search-as-you-type combobox with a "+ Create '…'" entry that appears
 * when the typed text doesn't match any existing option (case
 * insensitive). Clicking either an existing option or the create entry
 * resolves to the same string — "what the user wants this slot to
 * say." The caller decides whether that string is a select or a create
 * by checking it against its own data list.
 */
function CreatableSelect({
  data,
  value,
  onChange,
  label,
  placeholder,
  description,
  required,
}: {
  data: string[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
}) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const trimmed = value.trim();
  const filtered =
    trimmed.length === 0
      ? data
      : data.filter((d) => d.toLowerCase().includes(trimmed.toLowerCase()));
  const exactMatch =
    trimmed.length > 0 &&
    data.some((d) => d.toLowerCase() === trimmed.toLowerCase());
  const showCreate = !exactMatch && trimmed.length > 0;

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(val) => {
        onChange(val);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          description={description}
          label={label}
          placeholder={placeholder}
          required={required}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          value={value}
          onBlur={() => combobox.closeDropdown()}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            combobox.openDropdown();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {showCreate && (
            <Combobox.Option value={trimmed}>
              + Create &ldquo;{trimmed}&rdquo;
            </Combobox.Option>
          )}
          {filtered.map((d) => (
            <Combobox.Option key={d} value={d}>
              {d}
            </Combobox.Option>
          ))}
          {!showCreate && filtered.length === 0 && (
            <Combobox.Empty>No options</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
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
  amount?: string;
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
