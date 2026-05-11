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

/** ISO 4217 currency code, normalized to upper case. */
export const currencyField = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase());

export const idParam = z.object({ id: z.uuid() }).strict();
export type IdParam = z.infer<typeof idParam>;

/**
 * Client form state uses `""` as "no value" for many string/uuid fields
 * (one canonical "absent" shape across the form). At the wire boundary
 * we want those to read as absent, not as a strict-validation failure.
 * Use these wrappers for optional fields that the client may submit as
 * `""` — preprocess strips empties to `undefined` before validation, so
 * the inferred output type stays `field?: T | undefined`.
 */
export const emptyAsUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const optionalUuid = z.preprocess(emptyAsUndefined, z.uuid().optional());

export const optionalTrimmedString = (min: number, max: number) =>
  z.preprocess(
    emptyAsUndefined,
    z.string().trim().min(min).max(max).optional(),
  );

export const recurringFrequency = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
]);
export type RecurringFrequency = z.infer<typeof recurringFrequency>;
