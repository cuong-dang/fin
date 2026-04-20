# Agent guardrails

Short, enforceable conventions for this repo. Read before writing code.

## Layout

pnpm monorepo:

- `apps/server/` — Fastify 5 REST API, Node. Drizzle schema lives here
  at `src/db/schema.ts` (not a separate package).
- `apps/web/` — Vite + React 19 + React Router 7 + TanStack Query 5.
  SPA; no SSR.
- `packages/schemas/` — Zod schemas + TS types shared across server,
  web, and any future mobile client.
- `drizzle/` — generated migrations. Schema source of truth is at
  `apps/server/src/db/schema.ts`; `drizzle.config.ts` at the root
  points there.

No Next.js. No NextAuth. No Server Actions / Server Components. If you
see those terms anywhere, it's stale — delete or update.

## Auth

Google OAuth → server-minted JWT → bearer token. No cookies.

- Server: `@fastify/oauth2` for the Google dance, `@fastify/jwt` for
  signing. The `authenticate` decorator in [src/plugins/auth.ts]
  verifies the token and attaches `req.auth = { userId, groupId, email,
name }`. Protect routes by adding `app.addHook("preHandler",
app.authenticate)` at the plugin level.
- Client: JWT in `localStorage` via [src/lib/auth.ts]. Every request
  goes through [src/lib/api.ts] which adds `Authorization: Bearer
<token>`.
- URL fragment (`#token=…`) carries the token from server redirect to
  web; never sent back to server. Don't put tokens in query strings.

## Validation

Every request/response body is a Zod schema from `@fin/schemas`.
Server routes do `body = fooBody.parse(req.body)`. Don't redefine
schemas in the route — add to the shared package. If you feel tempted
to `z.string().min(1)` in a route, you're about to duplicate.

## Money

Signed `bigint` minor units, always. No floats touching stored amounts.

- Schema column: `bigint({ mode: "bigint" })`.
- Parse user input via `parseMoney(str, currency)` in
  [apps/server/src/lib/money.ts]. The client-side Zod schema
  (`moneyString`) has already regex-validated the format, so
  `parseMoney` trusts its input and only applies the currency's
  decimal count.
- Display via `formatMoney(amount, currency)` in
  [apps/web/src/lib/money.ts] — `Intl.NumberFormat` knows every ISO
  4217 currency's decimal count.
- For `<input type="number">` default values, use `formatMoneyPlain`.

## Dates

`transactions.date` is Postgres `DATE` (`mode: "string"`, "YYYY-MM-DD"),
not `timestamp`. No timezone. A transaction on April 4 stays on April 4
regardless of viewer tz.

- Nullable `date` on `transactions` = **pending**. See the pending
  transaction feature (server list query splits pending vs completed;
  `/:id/process` flips it).
- "Today" for a user-initiated action = `localDateKey(new Date())` on
  the client, always sent to the server. The server never fabricates
  a date — only the client knows the user's local tz. Required fields
  in the relevant Zod schemas, 400 if missing at the route boundary.

## Transaction model

- `transactions` row → one or more `transaction_legs` (signed account
  movements) and optional `transaction_lines` (category splits).
- Income: 1 leg (+), 1 line. Expense: 1 leg (−), 1 line. Transfer:
  2 legs (+ / −), no lines. Adjustment: 1 leg, no lines.
- Leg currency derives from the account; line currency is stored
  (may differ under FX).
- Full create/update goes through `insertLegsAndLines` in
  [apps/server/src/lib/transactions-write.ts]. Update rewrites rather
  than diffs — DELETE legs+lines then re-insert with the new payload.

## Workspace scoping

Every server mutation must verify ownership. Use `findOwned(table, id,
req.auth.groupId)` from [apps/server/src/lib/authz.ts] before touching
a row. Returns `null` if missing or not owned — the route should 404
or error from there.

## Client patterns

- Data fetching: `useQuery` against thin endpoint helpers in
  [apps/web/src/lib/endpoints.ts]. Don't `fetch` directly.
- Mutations: `useMutation` + `qc.invalidateQueries(...)` in `onSuccess`.
  Don't add manual refetches.
- Routing: React Router 7. Use `<Link to=...>`, `useNavigate`,
  `useParams`, `useSearchParams`. Never `next/link` / `next/navigation`.

## Style

- Typescript strict. No `any` without a comment. No `// @ts-ignore`.
- Tailwind v4 + shadcn/ui. UI primitives live in
  `apps/web/src/components/ui/`. Add there if you need a new one,
  don't inline Tailwind where a primitive exists.
- No `use server` / `use client` directives anywhere — this is a plain
  SPA + REST backend.
- Prefer `pnpm --filter @fin/<pkg> <cmd>` over `cd` when running
  package-scoped scripts.
