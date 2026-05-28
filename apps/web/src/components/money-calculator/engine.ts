/**
 * Calculator reducer for money entry. Behaves like a basic
 * desk-calculator (Casio-style): operators fold the running result
 * eagerly, ignoring textbook PEMDAS. `1 + 2 * 3 = 9`, not `7`.
 *
 * Why: users wire `(subtotal) * 1.07` for tax and `(subtotal) * 0.9`
 * for discounts as chained operations. Operator precedence would
 * surprise them — "I added it up first, then asked for tax" should
 * apply tax to the sum, not just the last addend.
 *
 * Every fold rounds to the currency's decimal count so a 99.99 ×
 * 1.07 step yields a real money amount (106.99), not 106.9893.
 *
 * Pure module. UI lives in `./calculator.tsx`; this file is the only
 * source of truth for the math.
 */

type Op = "+" | "-" | "*" | "/";

export type CalcState = {
  /**
   * Running result folded from operators so far. `null` when nothing
   * has been folded yet — i.e., the user has only typed an initial
   * operand and no operator.
   */
  accumulator: number | null;
  /** Operator waiting for its right operand. */
  pendingOp: Op | null;
  /** Operand being typed right now. May be empty between operator
   * and the first digit of the next operand. */
  currentInput: string;
  /**
   * Visual chain shown above the operand line. Accumulates parens
   * each time we fold — "(50 - 5) * 1.07".
   */
  displayExpr: string;
  /**
   * True when `currentInput` holds a finalized result (just after `=`,
   * or after seeding from an outside-controlled value). The next digit
   * or decimal should replace it rather than append; the next operator
   * should treat it as the left operand of a fresh chain.
   */
  justEvaluated: boolean;
};

export type CalcAction =
  | { kind: "digit"; d: string }
  | { kind: "decimal" }
  | { kind: "operator"; op: Op }
  | { kind: "equals" }
  | { kind: "backspace" }
  | { kind: "clear" }
  | { kind: "negate" }
  | { kind: "reset"; seed: string };

/**
 * Initial state. `seed`, when provided, becomes the initial operand
 * (useful when opening the popover on an existing field value).
 */
export function initialState(seed = ""): CalcState {
  return {
    accumulator: null,
    pendingOp: null,
    currentInput: seed,
    displayExpr: "",
    justEvaluated: false,
  };
}

export function reduce(
  s: CalcState,
  a: CalcAction,
  decimals: number,
): CalcState {
  switch (a.kind) {
    case "digit":
      return appendDigit(s, a.d);
    case "decimal":
      return appendDecimal(s);
    case "operator":
      return applyOperator(s, a.op, decimals);
    case "equals":
      return applyEquals(s, decimals);
    case "backspace":
      return backspace(s);
    case "clear":
      return initialState();
    case "negate":
      return negate(s, decimals);
    case "reset":
      // Reset seeds the engine with an externally-controlled value
      // (e.g., the money field's current text) and marks it as
      // finalized — so the next digit replaces it and the next
      // operator uses it as the left operand of a fresh chain.
      return { ...initialState(a.seed), justEvaluated: true };
  }
}

/**
 * Visible-now string the user sees as the "current operand" line.
 * Falls back to the accumulator when the user has folded but not yet
 * typed the next operand.
 */
export function currentValue(s: CalcState, decimals: number): string {
  if (s.currentInput !== "") return prettyOperand(s.currentInput);
  if (s.accumulator !== null)
    return prettyOperand(formatDecimal(s.accumulator, decimals));
  return "0";
}

/**
 * Full history line shown above the current-operand display. Composed
 * from the committed prefix (`displayExpr`, which always ends with
 * the pending op when one is set) plus the operand the user is
 * currently typing — so digits show up as soon as they're pressed,
 * matching the operator behavior.
 *
 *   "" + "5"          → "5"
 *   "5 +" + ""        → "5 +"
 *   "5 +" + "3"       → "5 + 3"
 *   "(5 + 3) ×" + "1" → "(5 + 3) × 1"
 */
export function displayExpression(s: CalcState): string {
  const ci = prettyOperand(s.currentInput);
  if (ci === "") return s.displayExpr;
  if (s.displayExpr === "") return ci;
  return `${s.displayExpr} ${ci}`;
}

/**
 * Swap a leading ASCII hyphen for U+2212 (typographic minus) so the
 * rendered form matches the operator symbols. `currentInput` keeps
 * the ASCII version so `Number()` and the parent-side money string
 * stay standards-clean.
 */
function prettyOperand(s: string): string {
  return s.startsWith("-") ? "−" + s.slice(1) : s;
}

/**
 * Pretty form of a typed operand rounded to the currency's precision.
 * Used when stitching the operand into `displayExpr` so the chain
 * shows the actual value being folded — typing `99.999 +` under USD
 * shows `100 +`, not `99.999 +`. Uses `Number#toString()` (not
 * `toFixed`) to avoid padding integers with trailing zeros.
 */
function roundedOperand(input: string, decimals: number): string {
  const n = Number(input);
  if (!Number.isFinite(n)) return prettyOperand(input);
  return prettyOperand(roundTo(n, decimals).toString());
}

/**
 * The committed money string when the user hits = / Enter. This is
 * what gets written back to the parent input.
 */
export function commitValue(s: CalcState, decimals: number): string {
  // If there's a pending operation, apply it first.
  const folded = applyEquals(s, decimals);
  const final =
    folded.accumulator ??
    (folded.currentInput === "" ? 0 : Number(folded.currentInput));
  return formatDecimal(roundTo(final, decimals), decimals);
}

// ─── Internal transitions ────────────────────────────────────────────────

function appendDigit(s: CalcState, d: string): CalcState {
  // After `=` (or after seeding from an outside value), a digit starts
  // a fresh operand instead of appending to the finalized result.
  if (s.justEvaluated) {
    return {
      accumulator: null,
      pendingOp: null,
      currentInput: d,
      displayExpr: "",
      justEvaluated: false,
    };
  }
  if (s.currentInput === "0") {
    // "0" + digit → drop the leading zero so "07" doesn't appear.
    return { ...s, currentInput: d };
  }
  return { ...s, currentInput: s.currentInput + d };
}

function appendDecimal(s: CalcState): CalcState {
  if (s.justEvaluated) {
    return {
      accumulator: null,
      pendingOp: null,
      currentInput: "0.",
      displayExpr: "",
      justEvaluated: false,
    };
  }
  if (s.currentInput === "") return { ...s, currentInput: "0." };
  if (s.currentInput.includes(".")) return s; // one decimal point max
  return { ...s, currentInput: s.currentInput + "." };
}

function applyOperator(s: CalcState, op: Op, decimals: number): CalcState {
  // Invariant: while pendingOp is non-null, displayExpr ends with that
  // operator's symbol (e.g., "5 +") so the user sees what they pressed.

  // Case 1: user pressed an operator with no current input — replace
  // the pending operator. Lets the user fix a typo ("2 + *" → "2 *").
  // Strip the trailing op symbol from displayExpr and append the new
  // one so the correction is visible immediately.
  if (s.currentInput === "" && s.accumulator !== null) {
    return {
      ...s,
      pendingOp: op,
      displayExpr: s.displayExpr.slice(0, -1) + symbolOf(op),
    };
  }
  // Case 2: this is the first operator after a fresh operand (or
  // after a finalized result) — seed the accumulator and start the
  // visual chain. Show the operand as-typed (no trailing-zero padding)
  // so it matches how subsequent operands appear in the chain.
  if (s.accumulator === null) {
    const n = Number(s.currentInput);
    if (!Number.isFinite(n)) return s;
    const rounded = roundTo(n, decimals);
    return {
      accumulator: rounded,
      pendingOp: op,
      currentInput: "",
      displayExpr: `${prettyOperand(rounded.toString())} ${symbolOf(op)}`,
      justEvaluated: false,
    };
  }
  // Case 3: fold the previous operation, wrap the prior chain in
  // parens, start a new pending op. The prior displayExpr already
  // ends in its operator, so just append the right operand and the
  // new operator after closing the paren.
  return {
    accumulator: fold(s, decimals),
    pendingOp: op,
    currentInput: "",
    displayExpr: `(${s.displayExpr} ${roundedOperand(s.currentInput, decimals)}) ${symbolOf(op)}`,
    justEvaluated: false,
  };
}

function applyEquals(s: CalcState, decimals: number): CalcState {
  if (s.pendingOp === null || s.accumulator === null) {
    // Nothing pending — equals on a bare operand is a no-op (the
    // operand is already the value).
    return s;
  }
  // No right operand typed yet — drop the dangling operator and
  // finalize the accumulator. So "1 − =" yields 1, not 0.
  if (s.currentInput === "") {
    return {
      accumulator: null,
      pendingOp: null,
      currentInput: formatDecimal(s.accumulator, decimals),
      displayExpr: "",
      justEvaluated: true,
    };
  }
  // After fold, the result becomes the new operand-as-finalized. Clear
  // the accumulator so the next operator press goes through Case 2
  // (which uses currentInput as the new left operand). justEvaluated
  // marks the result so the next digit/decimal starts fresh.
  return {
    accumulator: null,
    pendingOp: null,
    currentInput: formatDecimal(fold(s, decimals), decimals),
    displayExpr: "",
    justEvaluated: true,
  };
}

function fold(s: CalcState, decimals: number): number {
  if (s.accumulator === null || s.pendingOp === null) {
    // Shouldn't be reachable from applyOperator/applyEquals paths.
    throw new Error("Invariant: fold called with nothing to fold");
  }
  const right = s.currentInput === "" ? s.accumulator : Number(s.currentInput);
  if (!Number.isFinite(right)) return s.accumulator;
  let raw: number;
  switch (s.pendingOp) {
    case "+":
      raw = s.accumulator + right;
      break;
    case "-":
      raw = s.accumulator - right;
      break;
    case "*":
      raw = s.accumulator * right;
      break;
    case "/":
      // Divide-by-zero → keep accumulator; UI can show an error chip.
      // Returning the previous accumulator avoids `Infinity` polluting
      // downstream rounding.
      raw = right === 0 ? s.accumulator : s.accumulator / right;
      break;
  }
  return roundTo(raw, decimals);
}

function backspace(s: CalcState): CalcState {
  if (s.currentInput !== "") {
    // Backspace on a finalized value (just-evaluated result, or a
    // seeded prefill like "100") enters edit mode: subsequent digits
    // should append (`100` → backspace → `10` → `5` → `105`), not
    // replace. Clearing `justEvaluated` here flips the engine out of
    // "treat current as finalized" semantics.
    return {
      ...s,
      currentInput: s.currentInput.slice(0, -1),
      justEvaluated: false,
    };
  }
  // Sitting after a pending operator with no right operand — pop the
  // op and restore the prior operand so the user can edit it. Works
  // for the simple "N <op>" chain (Case 2's display format is just
  // `<operand> <op>`). For nested expressions ending in `) <op>`,
  // backing out cleanly would require remembering the pre-fold state;
  // we stay a no-op there and the user can use Clear.
  if (s.pendingOp !== null && s.displayExpr.length > 0) {
    const lastSpace = s.displayExpr.lastIndexOf(" ");
    if (lastSpace <= 0) return s;
    const left = s.displayExpr.slice(0, lastSpace);
    if (left.endsWith(")")) return s;
    return {
      accumulator: null,
      pendingOp: null,
      currentInput: left,
      displayExpr: "",
      justEvaluated: false,
    };
  }
  return s;
}

function negate(s: CalcState, decimals: number): CalcState {
  // Mid-expression with a typed right operand: fold the whole
  // chain first, then negate the result. So `1 + 2 n` becomes
  // `-(1 + 2) = -3`, not `1 + -2 = -1` — the user's mental model is
  // "negate what I have so far," not "flip the last operand."
  if (s.pendingOp !== null && s.accumulator !== null && s.currentInput !== "") {
    const folded = fold(s, decimals);
    return {
      accumulator: null,
      pendingOp: null,
      currentInput: formatDecimal(-folded, decimals),
      displayExpr: "",
      justEvaluated: true,
    };
  }
  // Otherwise: flip the sign of whatever operand is being typed.
  // Empty input becomes "-" so the user can start a negative number
  // by pressing the minus sign on a blank field; a lone "-" toggles
  // back to empty.
  if (s.currentInput === "") {
    return { ...s, currentInput: "-", justEvaluated: false };
  }
  if (s.currentInput === "-") {
    return { ...s, currentInput: "", justEvaluated: false };
  }
  if (s.currentInput.startsWith("-")) {
    return {
      ...s,
      currentInput: s.currentInput.slice(1),
      justEvaluated: false,
    };
  }
  return {
    ...s,
    currentInput: "-" + s.currentInput,
    justEvaluated: false,
  };
}

function symbolOf(op: Op): string {
  switch (op) {
    case "+":
      return "+";
    case "-":
      return "−"; // U+2212 minus sign for cleaner display
    case "*":
      return "×";
    case "/":
      return "÷";
  }
}

function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function formatDecimal(n: number, decimals: number): string {
  // toFixed handles negative zero (`-0`) too — prints "0.00" rather
  // than "-0.00".
  return (n === 0 ? 0 : n).toFixed(decimals);
}
