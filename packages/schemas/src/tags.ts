import { z } from "zod";

export type Tag = { id: string; name: string };

export const tagName = z.string().trim().min(1).max(100);

export const createTagBody = z.object({ name: tagName }).strict();
export type CreateTagBody = z.infer<typeof createTagBody>;

export const updateTagBody = z.object({ name: tagName }).strict();
export type UpdateTagBody = z.infer<typeof updateTagBody>;

export const listTagsQuery = z.object({
  // When set, restricts the result to tags that have been used on at
  // least one line of that category kind. Used by analytics charts so
  // the tag picker doesn't surface tags irrelevant to the current
  // direction (e.g., expense-only tags while viewing income).
  kind: z.enum(["expense", "income"]).optional(),
});
