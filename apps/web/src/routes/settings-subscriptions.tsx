import type { Subscription } from "@fin/schemas";
import { Anchor, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { PageShell } from "@/components/page-shell";
import { SectionHeader } from "@/components/section-header";
import { listSubscriptions } from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";

export function SettingsSubscriptionsRoute() {
  const q = useQuery({
    queryKey: ["subscriptions"],
    queryFn: listSubscriptions,
  });
  const all = q.data ?? [];
  const active = all.filter((s) => s.cancelledAt === null);
  const cancelled = all.filter((s) => s.cancelledAt !== null);

  return (
    <PageShell
      back="/settings"
      right={
        <Button component={Link} to="/subscriptions/new">
          New subscription
        </Button>
      }
      subtitle="Recurring expenses you pay on a schedule. Charges link back to the subscription so totals roll up over time."
      title="Subscriptions"
    >
      {all.length === 0 ? (
        <Text c="dimmed" size="sm">
          No subscriptions yet.
        </Text>
      ) : (
        <Stack>
          {active.length > 0 && (
            <Stack gap="xs">
              <SectionHeader>Active</SectionHeader>
              {active.map((s) => (
                <Row key={s.id} sub={s} />
              ))}
            </Stack>
          )}
          {cancelled.length > 0 && (
            <Stack gap="xs">
              <SectionHeader>Cancelled</SectionHeader>
              {cancelled.map((s) => (
                <Row key={s.id} sub={s} />
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </PageShell>
  );
}

function Row({ sub }: { sub: Subscription }) {
  const total = sub.defaultLines.reduce((acc, l) => acc + BigInt(l.amount), 0n);
  return (
    <Group justify="space-between">
      <Anchor
        c="inherit"
        component={Link}
        to={`/subscriptions/${sub.id}/edit`}
        underline="never"
      >
        <Group>
          <Text fw={500} size="sm">
            {sub.name}
          </Text>
          <Badge color="gray" variant="light">
            {sub.frequency}
          </Badge>
        </Group>
      </Anchor>
      <Text c="dimmed" ff="monospace" size="sm">
        {formatMoney(total, sub.currency)}
      </Text>
    </Group>
  );
}
