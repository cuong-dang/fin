import { z } from "zod";

import { optionalTrimmedString, optionalUuid } from "./common.js";

export const categoryKind = z.enum(["income", "expense"]);
export type CategoryKind = z.infer<typeof categoryKind>;

// Shared shape used by every "line" body (transaction / bill / loan).
// Each field accepts `""` from the form layer — preprocess strips it to
// `undefined` so the resolver's XOR check sees absent rather than a
// validation failure.
export const categoryResolverInput = z.object({
  categoryId: optionalUuid,
  newCategoryName: optionalTrimmedString(1, 100),
  subcategoryId: optionalUuid,
  newSubcategoryName: optionalTrimmedString(1, 100),
});
export type CategoryResolverInput = z.infer<typeof categoryResolverInput>;

export const createCategoryBody = z
  .object({
    kind: categoryKind,
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;

export const updateCategoryBody = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;

export const createSubcategoryBody = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export type CreateSubcategoryBody = z.infer<typeof createSubcategoryBody>;

export const updateSubcategoryBody = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export type UpdateSubcategoryBody = z.infer<typeof updateSubcategoryBody>;

export type CategoryWithSubs = {
  id: string;
  kind: CategoryKind;
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};
