/**
 * Format a bigint amount in minor units as a currency string.
 *
 * Uses Intl.NumberFormat, which knows each ISO 4217 code's decimal count and
 * symbol. USD 1234n → "$12.34"; JPY 500n → "¥500"; VND 100000n → "₫100,000".
 */
export function formatMoney(
  amount: bigint,
  currency: string,
  locale: string = "en-US",
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const decimals = formatter.resolvedOptions().maximumFractionDigits;
  if (decimals === undefined) {
    throw new Error(`No decimal count resolved for currency ${currency}`);
  }
  const divisor = 10 ** decimals;
  // Amounts for a personal-finance app stay well within Number.MAX_SAFE_INTEGER,
  // so this conversion is safe. (Number.MAX_SAFE_INTEGER ≈ 9 quadrillion.)
  return formatter.format(Number(amount) / divisor);
}

/**
 * Parse a user-entered display string into minor units for storage.
 * Ignores currency symbols and thousands separators; handles negatives.
 * "$12.34" + USD → 1234n; "500" + JPY → 500n.
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
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`Could not parse "${input}" as a ${currency} amount`);
  }
  return BigInt(Math.round(value * 10 ** decimals));
}
