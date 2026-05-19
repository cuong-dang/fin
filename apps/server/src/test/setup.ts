/**
 * Test harness — loaded via `--import` BEFORE any test files. Top-level
 * await ensures the container is up and migrations applied before any
 * test module (or, transitively, `db/index.ts`) imports.
 *
 * One container per `pnpm test` run, shared across all `.test.ts`
 * files. Individual tests cooperate via `truncateAll()` in their
 * `beforeEach` hooks (see `test/helpers.ts`). Stopping the container
 * is wired to `process.on("exit")` so a `--watch` or interrupt cleanup
 * doesn't leak Docker resources.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
// Repo-root `drizzle/` holds the generated migrations. From this file
// (`apps/server/src/test/setup.ts`) that's four levels up.
const migrationsFolder = join(here, "..", "..", "..", "..", "drizzle");

const container = await new PostgreSqlContainer("postgres:18-alpine")
  .withDatabase("fin_test")
  .withUsername("fin")
  .withPassword("fin")
  .start();

// `env.ts` reads these at module import. Set them BEFORE anything
// else imports `db/index.ts` — top-level await here guarantees it.
process.env.DATABASE_URL = container.getConnectionUri();
process.env.AUTH_SECRET = "test-secret";
process.env.AUTH_GOOGLE_ID = "test-google-id";
process.env.AUTH_GOOGLE_SECRET = "test-google-secret";

// One-shot migration run with a dedicated client so it doesn't pin the
// app's pool while migrations execute.
{
  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  await client.end();
}

// Top-level `after()` from node:test runs once after the entire test
// suite. We need it (not `process.on("exit")`) because the
// production `db` module opens a long-lived postgres-js connection
// that keeps Node's event loop alive — `exit` would never fire on
// its own. Close the connection first so the loop drains, then stop
// the container so Docker resources are reclaimed.
const { after } = await import("node:test");
const { closeDb } = await import("../db/index.js");
after(async () => {
  await closeDb();
  await container.stop();
});
