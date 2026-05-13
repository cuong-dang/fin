import type { Granularity } from "@fin/schemas";
import { Card, Text } from "@mantine/core";

/**
 * Placeholder. Full implementation comes in a follow-up PR, mirroring
 * the cash-flow chart's pattern (toolbar above a Mantine chart, no
 * chart-element clicks).
 */
export function CategorySpendingChart(_: {
  granularity: Granularity;
  start: string;
  end: string;
  currency: string;
}) {
  return (
    <Card>
      <Text c="dimmed">Category spending chart — coming soon.</Text>
    </Card>
  );
}
