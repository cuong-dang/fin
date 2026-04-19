import * as React from "react";

import { Input } from "@/components/ui/input";

/**
 * Money-entry input. Preset to `type="number"` + `inputMode="decimal"` so the
 * browser rejects non-numeric keypresses and mobile shows the decimal numpad.
 * `step="any"` allows fractional values for currencies that need them (USD
 * etc.); currencies with zero decimals just round server-side.
 *
 * Pass `name` so the value is included in the enclosing <form>'s FormData,
 * and an `id` that matches the associated <Label htmlFor>.
 */
function MoneyInput(
  props: Omit<
    React.ComponentProps<typeof Input>,
    "type" | "step" | "inputMode"
  >,
) {
  return <Input type="number" step="any" inputMode="decimal" {...props} />;
}

export { MoneyInput };
