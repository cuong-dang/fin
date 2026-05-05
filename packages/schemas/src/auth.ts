import { z } from "zod";

export const userSummary = z.object({
  userId: z.uuid(),
  email: z.string(),
  name: z.string(),
});
export type UserSummary = z.infer<typeof userSummary>;

export const workspaceMembership = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(["owner", "member"]),
});
export type workspaceMembership = z.infer<typeof workspaceMembership>;

export const meResponse = z.object({
  user: userSummary,
  workspaces: z.array(workspaceMembership),
});
export type Me = z.infer<typeof meResponse>;
