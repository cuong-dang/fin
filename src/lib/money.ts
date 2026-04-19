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

// Matches "12", "12.", "12.34", ".5", "-12.34", etc. Anchored so extra
// characters (currency symbols, commas, stray letters) fail. The UI layer is
// responsible for feeding only well-formed decimals (see <MoneyInput>).
const MONEY_RE = /^-?(\d+\.?\d*|\.\d+)$/;

/**
 * Parse a well-formed decimal string into minor units for storage.
 * "12.34" + USD → 1234n; "500" + JPY → 500n. Throws on invalid input.
 */
export function parseMoney(input: string, currency: string): bigint {
  if (!MONEY_RE.test(input)) {
    throw new Error(`Invalid money value: ${JSON.stringify(input)}`);
  }
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  });
  const decimals = formatter.resolvedOptions().maximumFractionDigits;
  if (decimals === undefined) {
    throw new Error(`No decimal count resolved for currency ${currency}`);
  }
  const value = parseFloat(input);
  return BigInt(Math.round(value * 10 ** decimals));
}
