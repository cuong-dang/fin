import { PageShell } from "@/components/page-shell";
import { SectionHeader } from "@/components/section-header";
import { listBills } from "@/lib/endpoints";
import { formatMoney } from "@/lib/money";

import type { Bill, BillType } from "@fin/schemas";
import { Anchor, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

const TYPE_LABEL: Record<BillType, string> = {
  utility: "Utility",
  subscription: "Subscription",
  other: "Other",
};

const TYPE_ORDER: BillType[] = ["utility", "subscription", "other"];

export function SettingsBillsRoute() {
  const q = useQuery({ queryKey: ["bills"], queryFn: listBills });
  const all = q.data ?? [];
  const active = all.filter((b) => b.cancelledAt === null);
  const cancelled = all.filter((b) => b.cancelledAt !== null);

  return (
    <PageShell
      back="/settings"
      right={
        <Button component={Link} to="/bills/new">
          New bill
        </Button>
      }
      subtitle="Recurring charges you pay on a schedule — utilities, subscriptions, taxes & fees. Charges link back to the bill so totals roll up over time."
      title="Bills"
    >
      {all.length === 0 ? (
        <Text c="dimmed">No bills yet.</Text>
      ) : (
        <Stack>
          {active.length > 0 && (
            <Stack>
              <SectionHeader>Active</SectionHeader>
              {/* Group by type for at-a-glance scanning. */}
              {TYPE_ORDER.map((t) => {
                const inType = active.filter((b) => b.type === t);
                if (inType.length === 0) return null;
                return (
                  <Stack key={t} gap="xs">
                    <Text c="dimmed" size="sm">
                      {TYPE_LABEL[t]}
                    </Text>
                    {inType.map((b) => (
                      <Row key={b.id} bill={b} />
                    ))}
                  </Stack>
                );
              })}
            </Stack>
          )}
          {cancelled.length > 0 && (
            <Stack>
              <SectionHeader>Cancelled</SectionHeader>
              {cancelled.map((b) => (
                <Row key={b.id} bill={b} />
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </PageShell>
  );
}

function Row({ bill }: { bill: Bill }) {
  // Lines with a null amount (utilities, taxes — varies per period) are
  // skipped from the total. If every line is null, `total` stays at 0n —
  // rendered as the currency's zero, which reads as "no fixed amount"
  // alongside bills that do total to a fixed charge.
  const total = bill.defaultLines.reduce(
    (acc, l) => (l.amount ? acc + BigInt(l.amount) : acc),
    0n,
  );
  return (
    <Group justify="space-between">
      <Anchor
        c="inherit"
        component={Link}
        to={`/bills/${bill.id}/edit`}
        underline="never"
      >
        <Group>
          <Text fw={500}>{bill.name}</Text>
          <Badge color="black" variant="light">
            {bill.frequency}
          </Badge>
        </Group>
      </Anchor>
      <Text c="dimmed" ff="monospace">
        {formatMoney(total, bill.currency)}
      </Text>
    </Group>
  );
}
