import { TextInput } from "@mantine/core";

/**
 * Text input configured for money entry. Deliberately *not*
 * `type="number"`:
 *
 *   - scrolling (mouse wheel / two-finger trackpad) over a focused
 *     number input silently changes the value
 *   - arrow keys do the same, by `step` (or 1 when `step="any"`)
 *   - browsers reformat on blur (drop trailing zeros, scientific
 *     notation for very large values, locale-dependent decimal/thousands
 *     reinterpretation)
 *
 * `inputMode="decimal"` still surfaces the numeric keypad on mobile,
 * and the `pattern` backstops shape validation client-side. The
 * authoritative validation lives in `moneyString` (Zod) on the server
 * and `parseMoney` on the server-side parse path; this component only
 * collects the string. `min` is a soft hint enforced at submit time —
 * `<input type="text">` doesn't honor it natively.
 */
export function MoneyField({
  label,
  description,
  value,
  onChange,
  required = true,
  min,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  /** Soft hint — surfaced as `min` for screen readers; native browser
   *  validation can't enforce it on a text input. Submit-time Zod
   *  on the server is the real gate. */
  min?: number;
}) {
  return (
    <TextInput
      aria-valuemin={min}
      autoComplete="off"
      description={description}
      inputMode="decimal"
      label={label}
      // Optional leading minus + digits + optional `.` and up to 4
      // decimals (covers JOD/BHD/KWD which use 3 decimals; one extra
      // for safety / mid-typing). Server re-validates.
      pattern="^-?\d*\.?\d{0,4}$"
      placeholder="0.00"
      required={required}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
