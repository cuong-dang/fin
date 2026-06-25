import { Button, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { Delete } from "lucide-react";
import { useReducer, useRef } from "react";

import {
  type CalcAction,
  type CalcState,
  commitValue,
  currentValue,
  displayExpression,
  initialState,
  reduce,
} from "./engine";

/**
 * Click-only calculator panel: history line + current operand + 4×5
 * keypad. Lives in a `Popover.Dropdown` next to a money field.
 *
 * Keyboard is handled by the inline engine on the money field itself;
 * this popover is the touch/pointer entry path. The component is
 * controlled-output — it doesn't mutate the seed value; it only fires
 * `onCommit(result)` when the user clicks `=`.
 */
export function MoneyCalculator({
  seed,
  decimals,
  onCommit,
  onCancel,
}: {
  /** Initial operand — typically the current money-field value. */
  seed: string;
  /** Currency decimal count; drives both rounding and display. */
  decimals: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  // Seed with `justEvaluated: true` so the seed value behaves like a
  // finalized result — clicking a digit starts fresh, clicking an
  // operator keeps the seed as the left operand. Matches the inline
  // money-field behavior on mount.
  const [state, dispatch] = useReducer(
    (s: CalcState, a: CalcAction) => reduce(s, a, decimals),
    seed,
    (s) => ({ ...initialState(s), justEvaluated: true }),
  );

  // Debounce guard, shared across all keys. iOS sometimes fires a
  // second pointerdown during the same gesture (most likely because
  // the popover re-renders the button DOM after the first dispatch
  // and iOS routes a fresh event to the new node still under the
  // finger). A 50ms guard drops those doubles without blocking real
  // fast tapping — humans can't tap faster than ~100ms apart.
  const lastFire = useRef(0);
  const shouldFire = () => {
    const now = Date.now();
    if (now - lastFire.current < 50) return false;
    lastFire.current = now;
    return true;
  };
  const safeDispatch = (a: CalcAction) => {
    if (shouldFire()) dispatch(a);
  };
  const safeCommit = () => {
    if (shouldFire()) onCommit(commitValue(state, decimals));
  };

  const display = currentValue(state, decimals);

  return (
    <Stack>
      {/* History — the running parenthesized expression. Empty until
          the first operator is pressed. */}
      <Text c="dimmed" size="xs" ta="right">
        {displayExpression(state) || "0"}
      </Text>
      <Text ff="monospace" fw={500} size="xl" ta="right">
        {display}
      </Text>
      <SimpleGrid cols={4} spacing={4}>
        <KeyButton onClick={() => safeDispatch({ kind: "clear" })}>C</KeyButton>
        <KeyButton onClick={() => safeDispatch({ kind: "negate" })}>±</KeyButton>
        <KeyButton onClick={() => safeDispatch({ kind: "backspace" })}>
          <Delete size={16} />
        </KeyButton>
        <KeyButton
          variant="filled"
          onClick={() => safeDispatch({ kind: "operator", op: "/" })}
        >
          ÷
        </KeyButton>

        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "7" })}>
          7
        </KeyButton>
        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "8" })}>
          8
        </KeyButton>
        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "9" })}>
          9
        </KeyButton>
        <KeyButton
          variant="filled"
          onClick={() => safeDispatch({ kind: "operator", op: "*" })}
        >
          ×
        </KeyButton>

        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "4" })}>
          4
        </KeyButton>
        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "5" })}>
          5
        </KeyButton>
        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "6" })}>
          6
        </KeyButton>
        <KeyButton
          variant="filled"
          onClick={() => safeDispatch({ kind: "operator", op: "-" })}
        >
          −
        </KeyButton>

        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "1" })}>
          1
        </KeyButton>
        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "2" })}>
          2
        </KeyButton>
        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "3" })}>
          3
        </KeyButton>
        <KeyButton
          variant="filled"
          onClick={() => safeDispatch({ kind: "operator", op: "+" })}
        >
          +
        </KeyButton>

        <KeyButton onClick={() => safeDispatch({ kind: "digit", d: "0" })}>
          0
        </KeyButton>
        <KeyButton onClick={() => safeDispatch({ kind: "decimal" })}>.</KeyButton>
        <KeyButton
          color="teal"
          style={{ gridColumn: "span 2" }}
          variant="filled"
          onClick={safeCommit}
        >
          =
        </KeyButton>
      </SimpleGrid>
      <Group justify="flex-end">
        <Button size="xs" variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}

function KeyButton({
  children,
  onClick,
  variant = "default",
  color,
  style,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "filled";
  color?: string;
  style?: React.CSSProperties;
}) {
  // Dispatch on `pointerdown` only — NOT also on `click`. iOS Safari
  // fires the synthesized click at *touchend's* element: if your
  // finger drifts a few pixels between touchstart and touchend
  // (common with rapid column-tapping like 2-5-8 or 3-2-1), the click
  // lands on a neighboring button. Earlier we tried tracking
  // "already fired on pointerdown" via a per-button ref, but each
  // KeyButton has its own ref — when finger drift makes pointerdown
  // hit button A and click hit button B, B's ref is still false and
  // B's click handler fires too, producing TWO dispatches per tap
  // (the "2585" / "1321" bug).
  //
  // The reliable fix is to not attach a click handler at all: the
  // native click event still fires but is a no-op, so finger drift
  // can no longer trigger a second dispatch. Side effect: the button
  // is unreachable via keyboard Space/Enter — fine here because the
  // popover is touch/mouse-only (the inline engine on the money
  // field owns the keyboard path). `touchAction: manipulation` stays
  // for snappier visual feedback (kills iOS's 300ms zoom delay).
  const merged: React.CSSProperties = {
    touchAction: "manipulation",
    ...(style ?? {}),
  };
  return (
    <Button
      style={merged}
      variant={variant}
      onPointerDown={onClick}
      {...(color !== undefined && { color })}
    >
      {children}
    </Button>
  );
}
