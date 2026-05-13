import { Breadcrumbs, Button, Text } from "@mantine/core";

import { type ChartState, crumbLabel } from "./cash-flow-state";

/**
 * Breadcrumb showing the current drill path. First crumb is always
 * "All" (root for the active direction). Non-last crumbs are subtle
 * buttons that pop the drill back to that depth; the last crumb is
 * plain text to indicate the current position.
 */
export function DrillBreadcrumb({
  state,
  onPopTo,
}: {
  state: ChartState;
  /** depth=0 resets drill; depth=N keeps the first N segments. */
  onPopTo: (depth: number) => void;
}) {
  const { drill } = state;

  return (
    <Breadcrumbs separator="›" separatorMargin="xs">
      {drill.length === 0 ? (
        <Text fw={500}>All</Text>
      ) : (
        <Button size="compact-sm" variant="subtle" onClick={() => onPopTo(0)}>
          All
        </Button>
      )}
      {drill.map((seg, i) => {
        const last = i === drill.length - 1;
        const label = crumbLabel(seg);
        if (last) {
          return (
            <Text key={i} fw={500}>
              {label}
            </Text>
          );
        }
        return (
          <Button
            key={i}
            size="compact-sm"
            variant="subtle"
            onClick={() => onPopTo(i + 1)}
          >
            {label}
          </Button>
        );
      })}
    </Breadcrumbs>
  );
}
