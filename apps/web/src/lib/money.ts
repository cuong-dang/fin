/**
 * 10^N where N is the currency's minor-unit decimal count. USD → 100,
 * JPY → 1, BHD → 1000. Use this for converting between bigint minor
 * units and JS-number major units (`Number(minor) / divisor`).
 */
export function currencyDivisor(currency: string): number {
  return 10 ** currencyDecimals(currency);
}

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
  // Amounts for a personal-finance app stay well within Number.MAX_SAFE_INTEGER,
  // so this conversion is safe. (Number.MAX_SAFE_INTEGER ≈ 9 quadrillion.)
  return formatter.format(Number(amount) / currencyDivisor(currency));
}

/**
 * Format an amount as a plain decimal string, with no currency symbol or
 * thousands separators. Suitable as a default value for <input type="number">.
 * USD 1234n → "12.34"; JPY 500n → "500"; VND 100000n → "100000".
 */
export function formatMoneyPlain(amount: bigint, currency: string): string {
  const decimals = currencyDecimals(currency);
  return (Number(amount) / 10 ** decimals).toFixed(decimals);
}

/**
 * Number of minor-unit decimal places for the given ISO 4217 code, as
 * reported by `Intl.NumberFormat`. USD → 2, JPY → 0, BHD → 3.
 */
function currencyDecimals(currency: string): number {
  const decimals = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  if (decimals === undefined) {
    throw new Error(`No decimal count resolved for currency ${currency}`);
  }
  return decimals;
}
