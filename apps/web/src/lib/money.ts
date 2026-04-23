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
 * Format an amount as a plain decimal string, with no currency symbol or
 * thousands separators. Suitable as a default value for <input type="number">.
 * USD 1234n → "12.34"; JPY 500n → "500"; VND 100000n → "100000".
 */
export function formatMoneyPlain(amount: bigint, currency: string): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  });
  const decimals = formatter.resolvedOptions().maximumFractionDigits;
  if (decimals === undefined) {
    throw new Error(`No decimal count resolved for currency ${currency}`);
  }
  const divisor = 10 ** decimals;
  return (Number(amount) / divisor).toFixed(decimals);
}
