/**
 * Parse a decimal money string into bigint minor units for storage.
 * Callers are expected to have already validated the format via the
 * `moneyString` Zod schema (see @fin/schemas); this function trusts that
 * and only knows about the currency's decimal count.
 */
export function parseMoney(input: string, currency: string): bigint {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  });
  const decimals = formatter.resolvedOptions().maximumFractionDigits;
  if (decimals === undefined) {
    throw new Error(`No decimal count resolved for currency ${currency}`);
  }
  return BigInt(Math.round(parseFloat(input) * 10 ** decimals));
}
