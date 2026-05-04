import { z } from "zod";

export const userSummary = z.object({
  userId: z.uuid(),
  email: z.string(),
  name: z.string(),
});
export type UserSummary = z.infer<typeof userSummary>;

export const groupMembership = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(["owner", "member"]),
});
export type GroupMembership = z.infer<typeof groupMembership>;

export const meResponse = z.object({
  user: userSummary,
  groups: z.array(groupMembership),
});
export type Me = z.infer<typeof meResponse>;
