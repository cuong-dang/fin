import { Button, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { Delete } from "lucide-react";
import { type KeyboardEvent, useEffect, useReducer, useRef } from "react";

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
 * Calculator panel: history line + current operand + 4×5 keypad.
 *
 * Designed to live in a `Popover.Dropdown`. The component is
 * controlled-output — it doesn't mutate the seed value; it only
 * fires `onCommit(result)` when the user hits `=` / Enter.
 *
 * Keyboard shortcuts (when the panel root has focus):
 *   0-9, . . . . . . append digit / decimal
 *   + - * /  . . .  operator
 *   Enter / = . . . commit
 *   Backspace . . . delete last digit
 *   Esc . . . . . . onCancel (parent typically closes the popover)
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
  const [state, dispatch] = useReducer(
    (s: CalcState, a: CalcAction) => reduce(s, a, decimals),
    seed,
    initialState,
  );

  // Keep keyboard focus on the panel root so typing always works —
  // both on first open (useEffect) and after any click inside the
  // popover (clicking a key button would otherwise move focus to that
  // button, hijacking Enter/Space). Click handler bubbles from
  // anywhere in the panel.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.focus();
  }, []);
  const refocus = () => rootRef.current?.focus();

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Don't fight native textbox handling — focus inside this panel
    // is on its root <div>, not on an input. Keys hit us first.
    if (e.key >= "0" && e.key <= "9") {
      dispatch({ kind: "digit", d: e.key });
    } else if (e.key === ".") {
      dispatch({ kind: "decimal" });
    } else if (e.key === "+" || e.key === "-") {
      dispatch({ kind: "operator", op: e.key });
    } else if (e.key === "*") {
      dispatch({ kind: "operator", op: "*" });
    } else if (e.key === "/") {
      e.preventDefault(); // browser quick-find
      dispatch({ kind: "operator", op: "/" });
    } else if (e.key === "Enter" || e.key === "=") {
      e.preventDefault();
      onCommit(commitValue(state, decimals));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      dispatch({ kind: "backspace" });
    } else if (e.key === "c" || e.key === "C") {
      dispatch({ kind: "clear" });
    } else if (e.key === "n" || e.key === "N") {
      dispatch({ kind: "negate" });
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else {
      return;
    }
    e.stopPropagation();
  };

  const display = currentValue(state, decimals);

  return (
    <Stack
      ref={rootRef}
      gap="xs"
      // tabIndex/outline so the panel can receive keyboard focus
      // immediately when the popover opens (useEffect focuses it).
      style={{ outline: "none", minWidth: 240 }}
      tabIndex={-1}
      onClick={refocus}
      onKeyDown={handleKeyDown}
    >
      {/* History — the running parenthesized expression. Empty until
          the first operator is pressed. */}
      <Text c="dimmed" size="xs" style={{ minHeight: 16 }} ta="right">
        {displayExpression(state) || " "}
      </Text>
      <Text ff="monospace" fw={500} size="xl" ta="right">
        {display}
      </Text>
      <SimpleGrid cols={4} spacing={4}>
        <KeyButton onClick={() => dispatch({ kind: "clear" })}>C</KeyButton>
        <KeyButton onClick={() => dispatch({ kind: "negate" })}>±</KeyButton>
        <KeyButton onClick={() => dispatch({ kind: "backspace" })}>
          <Delete size={16} />
        </KeyButton>
        <KeyButton
          variant="filled"
          onClick={() => dispatch({ kind: "operator", op: "/" })}
        >
          ÷
        </KeyButton>

        <KeyButton onClick={() => dispatch({ kind: "digit", d: "7" })}>
          7
        </KeyButton>
        <KeyButton onClick={() => dispatch({ kind: "digit", d: "8" })}>
          8
        </KeyButton>
        <KeyButton onClick={() => dispatch({ kind: "digit", d: "9" })}>
          9
        </KeyButton>
        <KeyButton
          variant="filled"
          onClick={() => dispatch({ kind: "operator", op: "*" })}
        >
          ×
        </KeyButton>

        <KeyButton onClick={() => dispatch({ kind: "digit", d: "4" })}>
          4
        </KeyButton>
        <KeyButton onClick={() => dispatch({ kind: "digit", d: "5" })}>
          5
        </KeyButton>
        <KeyButton onClick={() => dispatch({ kind: "digit", d: "6" })}>
          6
        </KeyButton>
        <KeyButton
          variant="filled"
          onClick={() => dispatch({ kind: "operator", op: "-" })}
        >
          −
        </KeyButton>

        <KeyButton onClick={() => dispatch({ kind: "digit", d: "1" })}>
          1
        </KeyButton>
        <KeyButton onClick={() => dispatch({ kind: "digit", d: "2" })}>
          2
        </KeyButton>
        <KeyButton onClick={() => dispatch({ kind: "digit", d: "3" })}>
          3
        </KeyButton>
        <KeyButton
          variant="filled"
          onClick={() => dispatch({ kind: "operator", op: "+" })}
        >
          +
        </KeyButton>

        <KeyButton onClick={() => dispatch({ kind: "digit", d: "0" })}>
          0
        </KeyButton>
        <KeyButton onClick={() => dispatch({ kind: "decimal" })}>.</KeyButton>
        <KeyButton
          color="teal"
          style={{ gridColumn: "span 2" }}
          variant="filled"
          onClick={() => onCommit(commitValue(state, decimals))}
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
  return (
    <Button
      h={36}
      px={0}
      size="sm"
      variant={variant}
      onClick={onClick}
      {...(color !== undefined && { color })}
      {...(style !== undefined && { style })}
    >
      {children}
    </Button>
  );
}
