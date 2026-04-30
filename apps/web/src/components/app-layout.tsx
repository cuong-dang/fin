import {
  ActionIcon,
  Anchor,
  AppShell,
  Avatar,
  Burger,
  Group,
  Menu,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Plus, Receipt, Repeat, Settings, Wallet } from "lucide-react";
import { useEffect } from "react";
import {
  Link,
  NavLink as RouterNavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router";

import { AccountsSidebar } from "@/features/accounts/accounts-sidebar";
import { clearAuth } from "@/lib/auth";
import { me } from "@/lib/endpoints";

const PAGES: { to: string; label: string }[] = [
  { to: "/charts", label: "Charts" },
  { to: "/transactions", label: "Transactions" },
];

/**
 * Multi-page chrome wrapper. Hosts the header (brand + page title + a
 * "+" create menu + user menu), the navbar (page nav + accounts
 * panel), and the Outlet for the current page.
 *
 * Form routes (account / transaction / bill edit etc.) sit
 * outside this layout so they get a focused, chrome-less view via
 * PageShell + BackLink.
 */
export function AppLayoutRoute() {
  const location = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);
  const pageLabel =
    PAGES.find((p) => location.pathname.startsWith(p.to))?.label ?? "fin";

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
        <Group h="100%" justify="space-between" px="xs">
          <Group>
            <Burger
              hiddenFrom="sm"
              opened={opened}
              size="sm"
              onClick={toggle}
            />
            <Anchor component={Link} fw={600} to="/charts" underline="never">
              fin
            </Anchor>
            <Title c="dimmed" fw={500} order={4}>
              {pageLabel}
            </Title>
          </Group>
          <Group gap="xs">
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
        <Stack h="100%">
          <Stack>
            {PAGES.map((p) => (
              <PageNavLink key={p.to} label={p.label} to={p.to} />
            ))}
          </Stack>
          <AccountsSidebar />
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

/**
 * "+" dropdown next to the user menu — the entry point for creating a
 * new transaction, account, or bill. Replaces the old FAB.
 * Mantine doesn't ship a built-in +/× morph icon, so the trigger
 * stays a plain `+` per the "don't bother custom-building it" call.
 */
function CreateMenu() {
  return (
    <Menu position="bottom-end" shadow="md" width={220}>
      <Menu.Target>
        <ActionIcon aria-label="Create" radius="lg" size="lg" variant="filled">
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

/** React Router's NavLink wired up to look like a Mantine nav row. */
function PageNavLink({ to, label }: { to: string; label: string }) {
  return (
    <RouterNavLink
      style={({ isActive }) => ({
        display: "block",
        padding: "8px 12px",
        borderRadius: 4,
        textDecoration: "none",
        color: "inherit",
        background: isActive ? "var(--mantine-color-default-hover)" : undefined,
        fontWeight: isActive ? 600 : 400,
      })}
      to={to}
    >
      {label}
    </RouterNavLink>
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
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <Menu position="bottom-end" shadow="md" width={240}>
      <Menu.Target>
        <ActionIcon aria-label="Account menu" radius="lg" size="lg">
          <Avatar color="initials" name={initials} radius="lg" size={28}>
            {initials}
          </Avatar>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Stack>
            <Text fw={500}>{name}</Text>
            <Text c="dimmed" size="xs">
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
