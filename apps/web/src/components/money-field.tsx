import { TextInput } from "@mantine/core";

/**
 * `<input type="number">` configured for money entry: decimal input mode,
 * `step="any"` so cents aren't blocked by the integer spinner, no min by
 * default (callers like transaction line amounts can pass `min={0}`).
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
  min?: number;
}) {
  return (
    <TextInput
      description={description}
      inputMode="decimal"
      label={label}
      min={min}
      placeholder="0.00"
      required={required}
      step="any"
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
