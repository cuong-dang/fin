import { Button, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { Delete } from "lucide-react";
import { useReducer } from "react";

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

  const display = currentValue(state, decimals);

  return (
    <Stack style={{ minWidth: 300 }}>
      {/* History — the running parenthesized expression. Empty until
          the first operator is pressed. */}
      <Text c="dimmed" size="xs" ta="right">
        {displayExpression(state) || "0"}
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
      variant={variant}
      onClick={onClick}
      {...(color !== undefined && { color })}
      {...(style !== undefined && { style })}
    >
      {children}
    </Button>
  );
}
