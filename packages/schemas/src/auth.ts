import { z } from "zod";

export const meResponse = z.object({
  userId: z.uuid(),
  groupId: z.uuid(),
  email: z.string(),
  name: z.string(),
});
export type Me = z.infer<typeof meResponse>;
