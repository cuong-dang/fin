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

**Clean, minimal UI, but with powerful features under the hood.** See
[Highlight features](#highlight-features) below for what's shipped today.

**A codebase I'm proud of.** This is also a learning vehicle for modern
full-stack TypeScript development. I care about readability, strong types,
small focused modules, and honest abstractions, the kind of code I'd want
to maintain in a year.

## Highlight features

What's shipped and works end-to-end today:

- **Accurate transaction model with legs & lines.** Double-entry-style:
  every transaction has _legs_ (signed account movements) separate from
  _lines_ (categorization). This is what supports income, expense,
  transfer, and balance-adjustment transactions uniformly — no
  special-casing per type — and keeps account balances and category
  rollups internally consistent.

- **Multi-line splits in one transaction.** A single shopping receipt can
  be one tx with multiple lines, each with its own category, subcategory,
  and tags (e.g., "$87 at Costco" → $50 Groceries / $25 Household / $12
  Snacks). Most apps force you to record each line as a separate tx; here
  the split lives at line level, so the timeline stays the shape of real
  events while analytics still sees the breakdown.

- **Native subscription support.** Subscriptions (Netflix, Spotify, gym,
  software licenses) are first-class entities with cadence, a default
  source account, and a categorization template (lines + tags). Recording
  a charge through the **Payment** tab auto-fills name, account, lines,
  and amount from the template — every field is still editable per charge
  for off-pattern bills. Past charges link back to their sub (rendered as
  `↻ Netflix` on the tx row) for "how much per month on subs?" analytics.

- **Credit-card accounts with limit tracking.** Accounts have a `type`
  (`checking_savings` / `credit_card` / `loan`-reserved). Credit cards
  carry a credit limit and an optional default pay-from account. The
  sidebar shows a live "remaining limit" progress bar that includes
  pending charges, color-shifting from green → red as it depletes.
  Paying a card via the **Payment** tab is a transfer underneath
  (checking → CC) with the source pre-filled from the card's default,
  keeping accounting honest while the UX stays simple.

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
- **Soft-delete for reference entities, hard-delete for transactions.**
  Accounts, categories, subcategories, tags, account groups, and
  subscriptions all carry a `deleted_at` timestamp + an active-only
  partial unique index, so historical transactions still resolve their
  (now-deleted) entity names. Transactions themselves are hard-deleted
  — nothing else references them, and balances re-derive automatically
  from the remaining legs.

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
- **Vite 8** + **React 19** + **React Router 7** web SPA
- **TanStack Query 5** for client-side server state
- **TypeScript** end to end
- **Drizzle ORM** + **Postgres 18**
- **Zod v4** for schema validation at every API boundary, shared
  between server and clients via `@fin/schemas`
- **Mantine 9** for UI primitives (styled, accessible, no Tailwind)
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
GET          /api/transactions/:id
PATCH|DELETE /api/transactions/:id
PATCH        /api/transactions/:id/adjustment
POST         /api/transactions/:id/process
POST         /api/transactions/reorder  (single-mover same-day or cross-day)

GET|POST     /api/categories
PATCH|DELETE /api/categories/:id
POST         /api/categories/:id/subcategories
PATCH|DELETE /api/subcategories/:id

GET|POST     /api/tags
PATCH|DELETE /api/tags/:id

GET|POST         /api/subscriptions
GET|PATCH|DELETE /api/subscriptions/:id
POST             /api/subscriptions/:id/cancel
```

### TODO

- [x] feature: Tags
- [x] feature: Subscription
- [x] feature: Credit card account type
- [ ] feature: Loan/Installment
- [ ] nicety: Auto-select filtered account when adding new transactions
