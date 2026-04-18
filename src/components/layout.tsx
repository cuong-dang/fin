import type { ReactNode } from "react";

/**
 * Full-height, left-right page shell. Intended to host a sidebar + main column.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return <div className="flex h-full">{children}</div>;
}

/**
 * Right-hand main column that owns its own vertical scroll. Use with
 * <PageHeader> (non-scrolling) + <MainContent> (scrolling) as children.
 */
export function MainColumn({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
  );
}

/** Scrollable content region inside a <MainColumn>. */
export function MainContent({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto">{children}</div>;
}

/**
 * Top-of-page header bar. Children become two slots: the first is rendered on
 * the left, the second on the right (justified apart). Keep children simple.
 */
export function PageHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      {children}
    </header>
  );
}

/**
 * Centered single-column shell for form / detail pages. Size controls the
 * column width — "md" for short forms, "lg" for longer ones.
 */
export function FormPage({
  size = "md",
  children,
}: {
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const width = size === "lg" ? "max-w-lg" : "max-w-md";
  return <main className={`mx-auto ${width} p-8`}>{children}</main>;
}
