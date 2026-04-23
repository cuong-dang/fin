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

## Architecture

pnpm monorepo: one REST API, one web SPA, one shared schema package.
Mobile (Expo / React Native) plugs in later by consuming `@fin/schemas`
and hitting the same API.

```
apps/
├─ server/     Fastify REST API (:3001) — @fin/server
│              (Drizzle schema lives at src/db/schema.ts)
└─ web/        Vite + React SPA (:5173)  — @fin/web
packages/
└─ schemas/    Shared Zod schemas + TS  — @fin/schemas
drizzle/       Generated migrations
```

## Tech stack

- **Fastify 5** server with **@fastify/jwt** + **@fastify/oauth2** (Google)
- **Vite 6** + **React 19** + **React Router 7** web SPA
- **TanStack Query 5** for client-side server state
- **TypeScript** end to end
- **Drizzle ORM** + **Postgres 17**
- **Zod v4** for schema validation at every API boundary, shared
  between server and clients via `@fin/schemas`
- **Mantine 7** for UI primitives (styled, accessible, no Tailwind)
- **dnd-kit** for drag-and-drop (same-day tx reorder, cross-day move)
- Bearer-token auth (JWT in `Authorization: Bearer`) + `X-Group-Id`
  header for the active workspace. Mobile clients plug in identically —
  no cookies

## Getting started

```bash
pnpm install
pnpm db:up                  # start Postgres in Docker
pnpm db:migrate             # apply migrations
pnpm dev                    # starts server (:3001) + web (:5173)
```

Visit `http://localhost:5173` and sign in with Google.

You'll need a `.env.local` at the repo root with:

```
DATABASE_URL=postgres://fin:fin@localhost:5432/fin
AUTH_SECRET=...             # openssl rand -base64 32
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
WEB_ORIGIN=http://localhost:5173   # optional, this is the default
```

On first sign-in the server auto-provisions your user row and a default
"Personal" workspace group.

## Useful scripts

- `pnpm dev` — server + web in parallel
- `pnpm dev:server` / `pnpm dev:web` — one at a time
- `pnpm build` — build both apps
- `pnpm typecheck` — tsc across the monorepo
- `pnpm test` — run all test suites under `apps/**`
- `pnpm lint` — ESLint across the repo
- `pnpm knip` — audit for unused files / exports / deps
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm db:up` / `pnpm db:down` — Postgres container
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` — Drizzle

## Testing philosophy

Tests live next to the code as `*.test.ts` and run via Node's built-in
`node:test` (no jest / vitest to configure). `pnpm test` walks every
app that declares a `test` script.

We don't chase coverage. TypeScript + Zod at the route boundary already
catch the classes of bug that unit-testing CRUD would — "did the route
call the right columns, did it 400 on bad input." Route handlers are
thin glue; tests there would mostly re-assert the framework.

What we _do_ test is **logic that's interesting or easy to get wrong**:
same-day merge-and-reorder semantics, sort-key invariants, anything
where the implementation has more than one reasonable behavior and the
choice matters. The goal is to pin down the subtle parts so we can
refactor them without anxiety — not to exercise every line.

## API shape

Workspace-scoped routes require two headers:

```
Authorization: Bearer <token>
X-Group-Id:    <active-workspace-id>
```

`/api/auth/*` is JWT-only; everything else requires both.

```
GET    /api/auth/google/start           → 302 to Google
GET    /api/auth/google/callback        → 302 to web with #token=…
GET    /api/auth/me                     → { user, groups }

GET|POST     /api/account-groups
PATCH|DELETE /api/account-groups/:id

GET|POST     /api/accounts
GET|PATCH|DELETE /api/accounts/:id

GET|POST     /api/transactions          (?accountId= to filter)
PATCH|DELETE /api/transactions/:id
PATCH        /api/transactions/:id/adjustment
POST         /api/transactions/:id/process
POST         /api/transactions/reorder  (single-mover same-day or cross-day)

GET|POST     /api/categories
PATCH|DELETE /api/categories/:id
POST         /api/categories/:id/subcategories
PATCH|DELETE /api/subcategories/:id

GET          /api/tags
```
