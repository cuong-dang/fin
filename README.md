# fin

A personal finance / money-tracking app.

<img alt="Main screen" src="docs/screenshots/main.png" width="600">

## Highlight features

Friction points other personal-finance apps make you live with —
`fin` treats them as primary cases:

- **Multi-line splits in one transaction.** A single receipt is one tx
  with multiple lines, each with its own category, subcategory, and
  tags (e.g. "$87 at Costco" → $50 Groceries / $25 Household / $12
  Snacks) — the timeline stays the shape of real events, analytics
  still see the breakdown.

  <img alt="Multi-line split in the New Transaction form" src="docs/screenshots/multi-line-splits.png" width="300">

- **Recurring bills with templates.** Utilities, subscriptions,
  insurance, taxes — first-class entities with a default source
  account and a categorization template. Recording a charge auto-fills
  from the template; past charges link back to the bill (`↻ Netflix`
  on the row).

  <img alt="Recurring bill template + Payment tab auto-fill" src="docs/screenshots/recurring-bills.png" width="300">

- **Credit cards with limit tracking.** CC accounts carry a credit
  limit and default pay-from account; the sidebar shows a live
  remaining-limit bar (incl. pending) shifting green → red. Payments
  are real transfers underneath.

  <img alt="Credit-card limit progress bar in the sidebar" src="docs/screenshots/credit-cards.png" width="300">

- **Loan accounts with amortization templates.** Mortgages, auto
  loans, BNPL pair 1:1 with a plan (cadence, default pay-from,
  fee/interest line template). Recording a payment pre-fills source
  and lines; the destination leg gets the principal portion, lines
  categorize fee/interest.

  <img alt="Loan account with amortization template + payment form" src="docs/screenshots/loans.png" width="300">

- **First-class refunds.** Refunds are their own transaction type linked
  back to the original. One click from any expense, per-line refund amounts.
  Analytics net the refund against the original tx's date. Net worth doesn't
  show a dip-and-rebound. The list row reads `↶ Refund of Whole Foods` and
  links back to the original.

  <img alt="Refund flow" src="docs/screenshots/refunds.png" width="300">

- **Budgets with pace-aware progress bars.** Per-category or
  per-subcategory caps on weekly/monthly/yearly cycles, each rendered
  as a progress bar with a "where you should be" tick and over/under
  pace caption (teal → yellow → red). Sibling subcategory budgets roll
  up into a synthetic parent row; pick any budget for a 12-cycle
  history chart.

  <img alt="Budgets with pace-aware progress bars." src="docs/screenshots/budgets.png" width="300">

- **Analytics — three charts, distinct questions:**
  - **Cash flow** — money leaving / entering everyday accounts each
    period. Loan payments count; loan-financed purchases don't show
    up until you pay the loan. Toggle Out / In / Net; drill by
    category or by individual loan / bill.

    <img alt="Cash flow chart — Out/In/Net with drill" src="docs/screenshots/cash-flow-chart.png" width="600">

  - **By category & tag** — where money goes, _including_ big-ticket
    items financed by loans on the day you bought them. Filter by
    tag, drill into subcategories.

    <img alt="By-category-and-tag chart" src="docs/screenshots/category-tag-chart.png" width="600">

  - **Net worth** — assets above zero, liabilities below, net line on
    top.

    <img alt="Net worth chart — diverging assets/liabilities with net line" src="docs/screenshots/net-worth-chart.png" width="600">

## What's distinctive about the data model

- **Double-entry transactions.** Each tx has _legs_ (signed account
  movements) and _lines_ (category splits) as separate tables —
  splits, transfers, and adjustments share one shape, no per-type
  special cases.
- **Signed `bigint` minor units.** No floats anywhere. Display goes
  through `Intl.NumberFormat`, which knows each ISO 4217 currency's
  decimal count.
- **Calendar dates, no timezone.** `transactions.date` is Postgres
  `DATE` as `"YYYY-MM-DD"` strings — April 4 stays April 4 anywhere.
- **Multi-currency, single-currency-per-account.** Account currency
  is immutable; leg currency derives from the account, line currency
  is stored separately for FX transfers.
- **Workspaces with strict per-mutation ownership.** Auto-provisioned
  "Personal" on first sign-in; every mutation runs through `findOwned`
  to verify the row belongs to the caller's workspace. Multi-member
  workspaces are scaffolded but the invite UI isn't wired yet.
- **Soft-delete reference entities, hard-delete transactions.**
  Accounts / categories / tags / bills / loans carry `deleted_at` with
  active-only unique indexes, so old txs still resolve names. Txs
  themselves hard-delete cleanly — balances re-derive from legs.
- **Tags as many-to-many on lines.** Same shape on bill and loan
  default-line templates, so template-generated payments inherit
  tags. Upserted by name at write time.

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

To explore with realistic activity (~7 months of transactions
exercising every highlight feature — multi-line splits, bills, CCs,
loans, a loan-financed BNPL purchase, tagged lines, and budgets that
land in each pace/cap band):

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
GET              /api/auth/google/start           → 302 to Google
GET              /api/auth/google/callback        → 302 to web with #token=…
GET              /api/auth/me                     → { user, groups }

GET|POST         /api/account-groups
PATCH|DELETE     /api/account-groups/:id

GET|POST         /api/accounts
GET|PATCH|DELETE /api/accounts/:id
POST             /api/accounts/:id/archive
POST             /api/accounts/:id/unarchive

GET|POST         /api/transactions              (?accountId= to filter)
GET|PATCH|DELETE /api/transactions/:id
PATCH            /api/transactions/:id/adjustment
POST             /api/transactions/:id/process
POST             /api/transactions/reorder      (single-mover same-day or cross-day)

GET|POST         /api/categories
PATCH|DELETE     /api/categories/:id
POST             /api/categories/:id/subcategories
PATCH|DELETE     /api/subcategories/:id

GET|POST         /api/tags                      (?kind= to filter)
PATCH|DELETE     /api/tags/:id

GET|POST         /api/bills
GET|PATCH|DELETE /api/bills/:id
POST             /api/bills/:id/cancel
POST             /api/bills/:id/resume

GET|POST         /api/budgets
PATCH|DELETE     /api/budgets/:id
GET              /api/budgets/snapshot          ?today=
GET              /api/budgets/:id/history       ?today=&cycles=

GET              /api/analytics/cash-flow       ?granularity=&start=&end=&currency=&dimension=&…
GET              /api/analytics/category-tag    ?granularity=&start=&end=&currency=&direction=&…
GET              /api/analytics/net-worth       ?granularity=&start=&end=&currency=
```

## Roadmap

- Transaction search
- Annuities / income templates (mirror of bill/loan templates)
- Shared workspaces (membership UI + invites)
- Mobile client (Expo + React Native, reusing `@fin/schemas`)
