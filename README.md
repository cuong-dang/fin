# fin

A personal finance / money-tracking app.

<img alt="Main screen" src="docs/screenshots/main.png" width="600">

## Highlight features

What sets this apart from every personal-finance app I've tried — each
of these was a friction point I kept hitting, and `fin` treats them as
primary cases instead of afterthoughts:

- **Multi-line splits in one transaction.** A single shopping receipt
  can be one tx with multiple lines, each with its own category,
  subcategory, and tags (e.g., "$87 at Costco" → $50 Groceries / $25
  Household / $12 Snacks). Most apps force you to record each line as
  a separate tx; here the split lives at line level, so the timeline
  stays the shape of real events while analytics still see the
  breakdown.

  <img alt="Multi-line split in the New Transaction form" src="docs/screenshots/multi-line-splits.png" width="300">

- **Native recurring bills with templates.** Utilities, subscriptions,
  insurance, taxes, anything that recurs — first-class entities with
  type (utility/subscription/other), cadence, a default source
  account, and a categorization template (lines + tags). Recording a
  charge through the **Payment** tab auto-fills account, lines, and
  amount from the template; every field is still editable per charge.
  Past charges link back to the bill (rendered as `↻ Netflix` on the
  tx row) for "how much on subscriptions this quarter?" answers.

  <img alt="Recurring bill template + Payment tab auto-fill" src="docs/screenshots/recurring-bills.png" width="300">

- **Credit-card accounts with limit tracking.** Accounts have a `type`
  (`checking_savings` / `credit_card` / `loan`). Credit cards carry a
  credit limit and an optional default pay-from account. The sidebar
  shows a live "remaining limit" progress bar that includes pending
  charges, color-shifting green → red as it depletes. Paying a card
  via the **Payment** tab is a transfer underneath (checking → CC) with
  the source pre-filled from the card's default — accounting honest,
  UX simple.

  <img alt="Credit-card limit progress bar in the sidebar" src="docs/screenshots/credit-cards.png" width="300">

- **Loan accounts with amortization templates.** Loan accounts
  (mortgage, auto loan, BNPL) pair 1:1 with a plan describing the
  schedule — payment amount, cadence, default pay-from, and a
  categorization template for fee/interest splits. The sidebar shows
  an approximate payments-remaining count. Recording a payment via
  **Payment > Loan** pre-fills source, amount, and the line breakdown
  from the plan; the destination leg gets the principal portion
  (`amount − Σ lines`), while the lines categorize the fee/interest
  portion (so spending reports still see "$10 to Interest" each
  month). Plan line amounts are _optional_ — amortizing loans split
  principal vs interest differently every period, so the template
  records categorization and the user fills per-period amounts at
  payment time.

  <img alt="Loan account with amortization template + payment form" src="docs/screenshots/loans.png" width="300">

- **Analytics that separate cash flow from purchase activity.** Three
  charts that answer different questions:
  - **Cash flow** — money actually leaving / entering your everyday
    (CASA + credit-card) accounts each period. Loan payments count;
    purchases financed on a loan account don't show up until you
    actually pay the loan. Toggle Out / In / Net; drill Out by
    expense → category → subcategory, or by individual loan / bill.

    <img alt="Cash flow chart — Out/In/Net with drill" src="docs/screenshots/cash-flow-chart.png" width="600">

  - **By category & tag** — where your money goes, broken down by
    category, _including_ big-ticket items financed by loans on the
    day you bought them. Drill into a category's subcategories;
    filter by tag (or "Untagged").

    <img alt="By-category-and-tag chart" src="docs/screenshots/category-tag-chart.png" width="600">

  - **Net worth** — assets above zero, liabilities below, net line
    on top, tracked over time. Accounts marked "exclude from net
    worth" stay out; balance adjustments are in.

    <img alt="Net worth chart — diverging assets/liabilities with net line" src="docs/screenshots/net-worth-chart.png" width="600">

  Every chart sits on one Mantine `AreaChart`; filters and drills are
  explicit controls (no click-the-legend magic).

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
- **Workspaces.** The data model supports shared workspaces (e.g. "Dang
  Family") with multiple members. On first sign-in you're placed in an
  auto-provisioned "Personal" workspace; the scaffolding is there to
  grow into family/shared usage.
- **Strict per-workspace ownership** on every mutation via a `findOwned`
  helper — no row is read or written without verifying it belongs to
  the caller's workspace.
- **Soft-delete for reference entities, hard-delete for transactions.**
  Accounts, categories, subcategories, tags, account groups, bills,
  and loans all carry a `deleted_at` timestamp alongside an active-only
  partial unique index, so historical transactions still resolve their
  (now-deleted) entity names. Transactions themselves are hard-deleted
  — nothing else references them, and balances re-derive automatically
  from the remaining legs.
- **Tags as a many-to-many on lines.** Each transaction line can carry
  zero or more tags (junction table `transaction_line_tags`); the same
  shape applies to bill default lines and loan default lines so a
  payment generated from a template inherits its tags automatically.
  Tags are upserted by name on write — the user types free-form, the
  server resolves to an existing tag or creates one.

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
- Bearer-token auth (JWT in `Authorization: Bearer`) + `X-Workspace-Id`
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
"Personal" workspace.

### Demo data

To explore with realistic activity (~7 months of transactions exercising
every highlight feature — multi-line splits, bills, CCs, loans, a
loan-financed BNPL purchase, and tagged lines):

```bash
pnpm db:seed
```

The seed wipes the first user's workspace and rewrites it from a
deterministic PRNG, so reruns produce the same dataset. Users,
workspaces, and memberships are preserved.

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
- `pnpm db:seed` — wipe + reseed the first user's workspace with demo data

## Deploy

Free-tier [Render](https://render.com) Blueprint at the repo root
([render.yaml](render.yaml)) defines two services that point at this
repo:

- **fin-api** — Fastify on a free Web Service (cold-starts after ~15
  min idle).
- **fin-web** — Vite SPA on a free Static Site (no spin-down).

One-time wiring after the first deploy:

1. Set `WEB_ORIGIN` on **fin-api** to the **fin-web** public URL Render
   assigns (used as the CORS allow-origin and the post-OAuth redirect
   target).
2. Set `VITE_API_URL` on **fin-web** to the **fin-api** public URL.
   This gets baked into the SPA bundle, so trigger a manual redeploy
   of fin-web after setting it.
3. Add `<fin-api URL>/api/auth/google/callback` to the authorized
   redirect URIs in Google Cloud Console for your OAuth client.

Database stays wherever you already host Postgres (e.g.
[Neon](https://neon.tech)); point `DATABASE_URL` on fin-api at it.

## API shape

Workspace-scoped routes require two headers:

```
Authorization: Bearer <token>
X-Workspace-Id:    <active-workspace-id>
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

GET|POST         /api/bills
GET|PATCH|DELETE /api/bills/:id
POST             /api/bills/:id/cancel
POST             /api/bills/:id/resume

GET              /api/analytics/cash-flow      ?granularity=&start=&end=&currency=&dimension=&…
GET              /api/analytics/category-tag   ?granularity=&start=&end=&currency=&direction=&…
GET              /api/analytics/net-worth      ?granularity=&start=&end=&currency=
```

## Roadmap

- Budgeting (per-category caps + alerts)
- Transaction search
- Annuities / income templates (mirror of bill/loan templates)
- Shared workspaces (membership UI + invites)
- Mobile client (Expo + React Native, reusing `@fin/schemas`)
