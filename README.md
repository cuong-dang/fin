# fin

A personal finance / money-tracking app. Built to replace the mobile app I
use daily, with the advanced features I've always wanted.

## Why

For years I've used a mobile money-tracker to manage my finances. It's
fine for the 80% case, but enough of my workflow lives in awkward
workarounds; e.g., having to break down transactions containing multiple
spending categories, tracking loan amortization, installment plans by hand;
that I've wanted something better. With LLM-assisted development making it
feasible to build this amidst other responsibilities, this project is that
replacement.

## Goals

**Clean, minimal UI, but with powerful features under the hood.** A few
things typical money-tracking apps don't do well (or at all), which this app
aims to be great at:

- Transactions that split across **multiple categories** in a single entry.
- **First-class installment plans** (mortgages, car loans, BNPL) as a
  modeled entity, not a hack on top of recurring transactions.
- **Advanced analytics**: stats, charts, and graphs that answer real
  financial questions, e.g., cash-flow trends, category drill-downs over time,
  net-worth tracking.
- _More to come as the project matures._

**A codebase I'm proud of.** This is also a learning vehicle for modern
full-stack TypeScript development. I care about readability, strong types,
small focused modules, and honest abstractions, the kind of code I'd want
to maintain in a year.

## What's distinctive about the data model

A few things that might matter if you're reading the source:

- **Double-entry-style transactions.** Each transaction has _legs_ (account
  movements, signed minor units) separated from _lines_ (category splits).
  This supports split-category transactions, transfers, and balance
  adjustments uniformly, no special-casing per type.
- **Signed `bigint` minor units for money.** No floating-point cents, ever.
  Arithmetic uses `BigInt` throughout; display formatting goes through
  `Intl.NumberFormat` which knows each ISO 4217 currency's decimal count.
- **Calendar-date transaction timestamps, no timezone.** A transaction on
  April 4 stays on April 4 no matter where you view it from. Stored as
  Postgres `DATE`, handled as `"YYYY-MM-DD"` strings in code.
- **Multi-currency, single-currency-per-account.** Account currency is
  immutable once created (changing it would invalidate existing legs). Leg
  currency is derived from account; line currency is stored separately (FX
  transfers can differ).
- **Workspace groups.** The data model supports shared workspaces (e.g.
  "Dang Family") with multiple members. On first sign-in you're placed in
  an auto-provisioned "Personal" group, and the scaffolding is there to
  grow into family/shared usage.
- **Strict per-workspace ownership** on every mutation via a `findOwned`
  helper, no row is read or written without verifying it belongs to the
  caller's group.

## Tech stack

- **Next.js 16** (App Router, Server Actions, Turbopack)
- **React 19** with Server Components
- **TypeScript** end to end
- **Drizzle ORM** + **Postgres 17**
- **Zod v4** for schema validation at every server-action boundary
- **Tailwind v4** + **shadcn/ui** primitives (Button, Input, Label, etc.)
  with local wrappers (`NativeSelect`, `MoneyInput`, `Field`) where the
  shadcn default didn't fit
- **NextAuth v5** with Google OAuth (JWT sessions, edge-safe proxy)

## Getting started

```bash
pnpm install
pnpm db:up                 # start Postgres in Docker
pnpm db:migrate            # apply migrations
pnpm dev                   # http://localhost:3000
```

You'll need a `.env.local` with:

```
DATABASE_URL=postgres://fin:fin@localhost:5432/fin
AUTH_SECRET=...            # openssl rand -base64 32
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
```

On first sign-in the app auto-provisions your user row and a default
"Personal" workspace group.

## Useful scripts

- `pnpm dev` — Next.js dev server (Turbopack)
- `pnpm build` / `pnpm start` — production build and serve
- `pnpm lint` / `pnpm format` — ESLint + Prettier
- `pnpm db:up` / `pnpm db:down` — Postgres container up/down
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migrations
- `pnpm db:studio` — Drizzle Studio (schema browser)

## Project layout

```
src/
├─ app/                    # App Router routes + route-local components
│  ├─ accounts/            # accounts CRUD + "manage" list
│  ├─ account-groups/      # account group edit
│  ├─ settings/            # settings hub; categories CRUD
│  ├─ transactions/        # create/edit/delete transactions, shared form
│  ├─ accounts-sidebar.tsx # home-page sidebar
│  ├─ transactions-list.tsx
│  └─ page.tsx             # home (transactions + sidebar)
├─ components/             # shared UI primitives (back-link, layout, ui/*)
├─ db/                     # Drizzle schema + client
└─ lib/                    # pure helpers (money, dates, authz, …)
drizzle/                   # generated migrations + snapshots
```
