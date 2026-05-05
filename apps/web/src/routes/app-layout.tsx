import { clearAuth } from "@/lib/auth.js";
import { me } from "@/lib/endpoints.js";

import {
  ActionIcon,
  Anchor,
  AppShell,
  Avatar,
  Burger,
  Group,
  Menu,
  NavLink,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Plus, Receipt, Repeat, Settings, Wallet } from "lucide-react";
import { useEffect } from "react";
import { Link, Outlet, useLocation, useMatch, useNavigate } from "react-router";

const PAGES: { to: string; label: string }[] = [
  { to: "/charts", label: "Charts" },
  { to: "/transactions", label: "Transactions" },
];

/**
 * Multi-page chrome wrapper. Hosts the header, the navbar, and the
 * Outlet for the current page.
 */
export function AppLayoutRoute() {
  const location = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);
  const pageLabel = PAGES.find((p) =>
    location.pathname.startsWith(p.to),
  )?.label;

  // Close the drawer after navigating on mobile so tapping a nav link
  // doesn't leave the drawer covering the page. We watch `location.key`
  // (changes on every navigation) instead of `pathname` so query-only
  // changes — e.g., clicking an account row that updates `?account=…`
  // — also dismiss the drawer. No-op on desktop where the navbar is
  // permanent (close() short-circuits when already closed).
  useEffect(() => {
    close();
  }, [location.key, close]);

  return (
    <AppShell
      header={{ height: 50 }}
      navbar={{
        width: 320,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
    >
      <AppShell.Header>
        <Group justify="space-between" p="sm">
          <Group>
            <Burger
              hiddenFrom="sm"
              opened={opened}
              size="sm"
              onClick={toggle}
            />
            <Anchor component={Link} fw={600} to="/" underline="never">
              fin
            </Anchor>
            <Title c="dimmed" fw={500} order={4}>
              {pageLabel}
            </Title>
          </Group>
          <Group>
            <CreateMenu />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar>
        {/* h="100%" lets AccountsSidebar's `flex={1}` ScrollArea
            actually fill the remaining navbar height — without it the
            outer Stack collapses to content height and the accounts
            list overflows the viewport without scrolling. */}
        <Stack gap={0} h="100%">
          {PAGES.map((p) => (
            <PageNavLink key={p.to} label={p.label} to={p.to} />
          ))}
          {/* <AccountsSidebar /> */}
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

function PageNavLink({ to, label }: { to: string; label: string }) {
  const match = useMatch(to);
  return <NavLink active={!!match} component={Link} label={label} to={to} />;
}

/**
 * "+" dropdown next to the user menu.
 */
function CreateMenu() {
  return (
    <Menu position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon aria-label="Create">
          <Plus size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          component={Link}
          leftSection={<Receipt size={14} />}
          to="/transactions/new"
        >
          New transaction
        </Menu.Item>
        <Menu.Item
          component={Link}
          leftSection={<Wallet size={14} />}
          to="/accounts/new"
        >
          New account
        </Menu.Item>
        <Menu.Item
          component={Link}
          leftSection={<Repeat size={14} />}
          to="/bills/new"
        >
          New bill
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const meQ = useQuery({ queryKey: ["me"], queryFn: me });
  const name = meQ.data?.user.name ?? "";
  const email = meQ.data?.user.email ?? "";
  const initials =
    name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <Menu position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon
          aria-label="Account menu"
          radius="lg"
          size="md"
          variant="light"
        >
          <Avatar color="initials" name={initials} size="sm">
            {initials}
          </Avatar>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Stack gap={0}>
            <Text fw={500}>{name}</Text>
            <Text c="dimmed" size="sm">
              {email}
            </Text>
          </Stack>
        </Menu.Label>
        <Menu.Divider />
        <Menu.Item
          component={Link}
          leftSection={<Settings size={14} />}
          to="/settings"
        >
          Settings
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<LogOut size={14} />}
          onClick={() => {
            clearAuth();
            navigate("/signin", { replace: true });
          }}
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
