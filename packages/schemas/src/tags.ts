import { z } from "zod";

export type Tag = { id: string; name: string };

export const tagName = z.string().trim().min(1).max(100);

export const createTagBody = z.object({ name: tagName });
export type CreateTagBody = z.infer<typeof createTagBody>;

export const updateTagBody = z.object({ name: tagName });
export type UpdateTagBody = z.infer<typeof updateTagBody>;
