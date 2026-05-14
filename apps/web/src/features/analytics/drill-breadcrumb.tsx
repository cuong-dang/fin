import { Breadcrumbs, Button, Text } from "@mantine/core";

/**
 * Drill-state breadcrumb. The first crumb is always "All" (root for
 * the current view); the last crumb is plain text marking the current
 * position. All others are clickable buttons that pop the drill back
 * to that depth. The caller computes the label sequence — this
 * component is state-shape agnostic.
 */
export function DrillBreadcrumb({
  labels,
  onPopTo,
}: {
  labels: string[];
  /** depth=0 resets drill; depth=N keeps the first N segments. */
  onPopTo: (depth: number) => void;
}) {
  return (
    <Breadcrumbs separator="›" separatorMargin="xs">
      {labels.length === 0 ? (
        <Text fw={500}>All</Text>
      ) : (
        <Button size="compact-sm" variant="subtle" onClick={() => onPopTo(0)}>
          All
        </Button>
      )}
      {labels.map((label, i) => {
        const last = i === labels.length - 1;
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
