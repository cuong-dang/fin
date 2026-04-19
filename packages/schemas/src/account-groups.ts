import { z } from "zod";

export const createAccountGroupBody = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateAccountGroupBody = z.infer<typeof createAccountGroupBody>;

export const updateAccountGroupBody = z.object({
  name: z.string().trim().min(1).max(100),
});
export type UpdateAccountGroupBody = z.infer<typeof updateAccountGroupBody>;

export type AccountGroup = {
  id: string;
  name: string;
};
