import { useMemo } from "react";

/**
 * Two currency formatters paired so callers don't reinvent the rule:
 *
 *   - `tooltipFormatter` — full precision, used by `valueFormatter` on
 *     the chart (`$1,234.56`). Cents matter when reading exact values.
 *   - `axisFormatter`    — zero-decimal, used by `yAxisProps.tickFormatter`
 *     (`$1,234`). Cents on every Y-axis label is just noise at chart
 *     scale.
 *
 * Returns `null` when `currency` is empty (charts page hasn't picked
 * one yet) so callers can short-circuit the prop.
 */
export function useCurrencyFormatters(currency: string) {
  return useMemo(() => {
    if (!currency) return null;
    const full = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    });
    const noCents = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    return {
      tooltipFormatter: (v: number) => full.format(v),
      axisFormatter: (v: number) => noCents.format(v),
    };
  }, [currency]);
}
