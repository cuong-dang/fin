import { z } from "zod";

/** Calendar date, "YYYY-MM-DD". */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const dateString = z.string().regex(DATE_RE, "Expected YYYY-MM-DD");

/** Plain decimal money string — client-side validated, server re-validates. */
export const MONEY_RE = /^-?(\d+\.?\d*|\.\d+)$/;
export const moneyString = z
  .string()
  .trim()
  .regex(MONEY_RE, "Expected a decimal number");

export const idParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof idParam>;
