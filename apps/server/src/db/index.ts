import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env";
import * as schemaNs from "./schema";

// Neon (and most serverless Postgres) reaps idle TCP connections aggressively.
// postgres-js's defaults (`idle_timeout: 0`, `max_lifetime: 30min`) mean we
// keep handing out pooled connections that the server has already closed,
// surfacing as `read ECONNRESET` on the next query. Evicting idle clients
// after 20s ensures we always reconnect before Neon hangs up.
const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 10 * 60,
  max_lifetime: 30 * 60,
  connect_timeout: 10,
});
export const db = drizzle(client, { schema: schemaNs });
export const schema = schemaNs;
type Db = typeof db;
export type PgTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
