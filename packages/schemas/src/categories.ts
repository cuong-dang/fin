import { z } from "zod";

export const categoryKind = z.enum(["income", "expense"]);
export type CategoryKind = z.infer<typeof categoryKind>;

// Shared shape for any line body that lets the user either pick an existing
// category/subcategory or inline-create a new one. Bill, loan, and
// transaction line schemas all extend this — and the server's
// `resolveCategory` helper consumes it directly, so a single Zod schema is
// the source of truth for both the wire contract and the resolver input.
export const categoryResolverInput = z.object({
  categoryId: z.uuid().optional(),
  newCategoryName: z.string().trim().min(1).max(100).optional(),
  subcategoryId: z.uuid().optional(),
  newSubcategoryName: z.string().trim().min(1).max(100).optional(),
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
