# Changelog

All notable changes to this project will be documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-05-14

Initial private preview.

### Transactions

- **Multi-line splits per transaction.** One receipt = one tx with N
  lines, each line independently categorized, subcategorized, and
  tagged. Analytics see the breakdown; the timeline keeps the shape of
  real events.
- **Pending transactions** (`date IS NULL`) pinned to the top of the
  list; `POST /transactions/:id/process` sets the date and allocates a
  per-day `sort_key`.
- **Drag-and-drop reorder** for same-day and cross-day moves via
  `dnd-kit`.
- **Adjustments** as a first-class transaction type for manual balance
  fixes (a single signed leg, no lines).

### Accounts

- Three account types — `checking_savings`, `credit_card`, `loan` —
  with a `type`-driven sidebar.
- **Credit-card limit tracking** with a "remaining limit" progress bar
  that includes pending charges (green → red as it depletes). Per-card
  default pay-from account.
- **Loan accounts** paired 1:1 with an amortization plan
  (`amount_per_period`, frequency, default pay-from, categorization
  template). Sidebar shows approximate payments-remaining.
- Per-account `exclude_from_net_worth` flag honored by the net-worth
  chart and sidebar totals.
- Soft-delete for reference entities (accounts, categories,
  subcategories, tags, account groups, bills, loans) with an
  active-only partial unique index so historical txns still resolve
  their (now-deleted) entity names.

### Bills

- **Recurring bills with templates** — `utility` / `subscription` /
  `other` with cadence, currency, default pay-from, and a
  categorization template (lines + tags).
- Recording a charge through **Payment** auto-fills account, lines,
  amount, and tags from the template; every field is still editable
  per charge.
- Past charges link back to the bill (`↻ Netflix` on the tx row);
  cancel / resume / delete bill endpoints.

### Loans

- **Amortization templates** — default lines categorize the
  fee/interest portion of each payment.
- Payment leg layout: source leg debits the full payment, destination
  leg credits the **principal portion only** (`amount − Σ lines`), so
  net worth recognizes interest as expense rather than absorbed debt.
- Supports BNPL flows: a purchase financed on a loan account moves
  category spending immediately, but cash flow waits for the loan
  payments.

### Analytics

Three charts on a shared Mantine `AreaChart`; filters and drills are
explicit toolbar controls (no click-the-legend magic):

- **Cash flow** — money actually leaving / entering CASA + CC accounts
  per period. Toggle Out / In / Net; drill Out by
  expense → category → subcategory, or by individual loan / bill;
  optional account-group filter.
- **By category & tag** — where money goes, broken down by category
  including big-ticket items financed by loans on the day you bought
  them. Subcategory drill; filter by tag or "Untagged".
- **Net worth** — diverging assets above / liabilities below, net line
  on top. Accounts marked "exclude from net worth" stay out;
  adjustments are in.

### Data model

- **Double-entry-style** transactions: signed-bigint legs (account
  movements) separated from positive lines (category splits).
- **Signed `bigint` minor units** for money everywhere — no floats.
  Display through `Intl.NumberFormat` keyed on ISO 4217 currency.
- **Calendar-date** transaction timestamps (Postgres `DATE`,
  `"YYYY-MM-DD"`) — no timezone drift across viewers.
- **Multi-currency, single-currency-per-account.** Account currency
  immutable post-create; line currency stored independently (FX
  transfers can differ).
- **Workspaces** with member roles; auto-provisioned "Personal"
  workspace on first sign-in. Every server mutation goes through
  `findOwned` to verify workspace ownership.
- **Tags** as many-to-many on lines (`transaction_line_tags`);
  bill/loan default lines carry their own tag tables so generated
  payments inherit tags. Free-form upsert by name.

### Auth & API

- Google OAuth → server-minted JWT (`@fastify/jwt`). Bearer token in
  `Authorization`, active workspace in `X-Workspace-Id`. No cookies —
  mobile clients plug in identically.
- REST API on Fastify 5 with Zod-validated request/response shapes
  shared via `@fin/schemas`.

### Stack

- Server: Fastify 5, Drizzle ORM, Postgres 18.
- Web: Vite 8, React 19, React Router 7, TanStack Query 5, Mantine 9.
- Schemas: Zod v4 shared between server and clients via
  `@fin/schemas`.
- Validation at every API boundary; strict-mode TypeScript end-to-end.

### Tooling

- `pnpm db:seed` — wipes the first user's workspace and writes ~7
  months of deterministic demo activity covering every highlight
  feature (multi-line splits, bills, CC settlements, amortizing loan,
  loan-financed BNPL purchase, tagged lines, opening-balance
  adjustments).
- `pnpm db:up` / `db:down` / `db:generate` / `db:migrate` /
  `db:studio` for Postgres + Drizzle.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm knip`,
  `pnpm format` across the monorepo.
