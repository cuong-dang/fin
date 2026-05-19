import { ActionIcon, Popover, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Calculator } from "lucide-react";
import { type KeyboardEvent, useEffect, useReducer, useRef } from "react";

import { currencyDecimals } from "../lib/money";
import { MoneyCalculator } from "./money-calculator/calculator";
import {
  type CalcAction,
  type CalcState,
  displayExpression,
  initialState,
  reduce,
} from "./money-calculator/engine";

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
 * `inputMode="decimal"` still surfaces the numeric keypad on mobile.
 * The authoritative validation lives in `moneyString` (Zod) on the
 * server and `parseMoney` on the server-side parse path; this
 * component only collects the string. `min` is a soft hint enforced
 * at submit time — `<input type="text">` doesn't honor it natively.
 *
 * The visible value is fully driven by the calculator engine
 * (`./money-calculator/engine.ts`). Plain numeric typing flows through
 * the engine and mirrors back to the parent live. As soon as the user
 * presses an operator (`+`, `*`, `/`, or `-` after a non-empty value),
 * the engine auto-groups the chain — `1 + 2 * 3` displays as
 * `(1 + 2) × 3` and Enter evaluates it. Negate (`n`) folds the whole
 * chain before flipping the sign; clear (`c`) wipes the field. The
 * popover with the visual keypad mounts the same engine for touch.
 */
export function MoneyField({
  label,
  description,
  value,
  onChange,
  required = true,
  min,
  currency,
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
  /** ISO 4217 currency code; drives the calculator's rounding (e.g.,
   *  2 decimals for USD, 3 for KWD, 0 for JPY). Defaults to 2 when
   *  unset, which is correct for the vast majority of currencies. */
  currency?: string;
}) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const decimals = currency ? currencyDecimals(currency) : 2;

  const [state, dispatch] = useReducer(
    (s: CalcState, a: CalcAction) => reduce(s, a, decimals),
    value,
    (seed) => ({ ...initialState(seed), justEvaluated: true }),
  );

  // Tracks the last value we either committed to the parent or saw
  // arrive from the parent.
  const lastSyncedRef = useRef(value);

  // External value change → re-seed engine. Skipped when the change
  // originated from our own mirror effect (lastSyncedRef matches).
  useEffect(() => {
    if (value !== lastSyncedRef.current) {
      dispatch({ kind: "reset", seed: value });
      lastSyncedRef.current = value;
    }
  }, [value]);

  // Plain-mode engine state → mirror currentInput to parent. We skip
  // mid-expression states (pendingOp set); the parent only learns the
  // value once it folds back to a single operand.
  useEffect(() => {
    if (state.pendingOp !== null) return;
    if (state.currentInput !== lastSyncedRef.current) {
      lastSyncedRef.current = state.currentInput;
      onChange(state.currentInput);
    }
  }, [state, onChange]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const k = e.key;
    const isOp = k === "+" || k === "-" || k === "*" || k === "/";

    if (k >= "0" && k <= "9") {
      e.preventDefault();
      dispatch({ kind: "digit", d: k });
    } else if (k === ".") {
      e.preventDefault();
      dispatch({ kind: "decimal" });
    } else if (isOp) {
      e.preventDefault();
      // Special case: "-" on an empty engine begins a negative number.
      // Routed through negate so the engine sets currentInput="-"
      // without the finalized-result flag — letting the next digit
      // append (`-` then `1` → `-1`) instead of replace.
      if (
        k === "-" &&
        state.currentInput === "" &&
        state.accumulator === null
      ) {
        dispatch({ kind: "negate" });
        return;
      }
      // Bare "+"/"*"/"/" on an empty engine: nothing to operate on.
      if (state.currentInput === "" && state.accumulator === null) return;
      dispatch({ kind: "operator", op: k as "+" | "-" | "*" | "/" });
    } else if (k === "=") {
      e.preventDefault();
      dispatch({ kind: "equals" });
    } else if (k === "Enter") {
      // If there's a pending op, evaluate but stay (don't submit the
      // form mid-expression). Otherwise let Enter bubble to submit.
      if (state.pendingOp !== null) {
        e.preventDefault();
        dispatch({ kind: "equals" });
      }
    } else if (k === "Backspace") {
      e.preventDefault();
      dispatch({ kind: "backspace" });
    } else if (k === "c" || k === "C") {
      e.preventDefault();
      dispatch({ kind: "clear" });
    } else if (k === "n" || k === "N") {
      e.preventDefault();
      dispatch({ kind: "negate" });
    }
  };

  const displayed = displayExpression(state);
  // The visible string contains operators / parens while the engine
  // is mid-expression; the standard money pattern would mark it
  // invalid. Apply the pattern only when the displayed text is
  // already a plain money string.
  const showPattern = state.pendingOp === null && state.displayExpr === "";

  return (
    <Popover
      opened={opened}
      position="bottom"
      shadow="md"
      withArrow
      onChange={(v) => !v && close()}
    >
      <Popover.Target>
        <TextInput
          aria-valuemin={min}
          autoComplete="off"
          description={description}
          inputMode="decimal"
          label={label}
          // Optional leading minus + digits + optional `.` and up to 4
          // decimals (covers JOD/BHD/KWD which use 3 decimals; one extra
          // for safety / mid-typing). Server re-validates.
          {...(showPattern ? { pattern: "^[-−]?\\d*\\.?\\d{0,4}$" } : {})}
          placeholder="0.00"
          required={required}
          rightSection={
            <ActionIcon
              aria-label="Open calculator"
              size="sm"
              variant="subtle"
              onClick={toggle}
            >
              <Calculator size={16} />
            </ActionIcon>
          }
          type="text"
          value={displayed}
          onBlur={() => {
            // Fold pending expressions on blur so the parent always
            // ends up with a clean money string when focus leaves.
            if (state.pendingOp !== null) dispatch({ kind: "equals" });
          }}
          onChange={() => {
            // Engine owns the visible value — discard native input
            // events. React will re-render with `displayed`.
          }}
          onKeyDown={handleKeyDown}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <MoneyCalculator
          decimals={decimals}
          seed={value}
          onCancel={close}
          onCommit={(v) => {
            onChange(v);
            close();
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
