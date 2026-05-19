import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env.js";
import * as schemaNs from "./schema.js";

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema: schemaNs });
export const schema = schemaNs;
type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Close the underlying postgres-js connection. Used by the test
 * harness to let Node's event loop drain after the suite finishes —
 * the long-lived connection otherwise keeps `node --test` hanging.
 * Not used by the running server (Fastify holds the process open).
 */
export const closeDb = () => client.end();
