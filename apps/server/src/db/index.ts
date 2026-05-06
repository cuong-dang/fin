import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env.js";
import * as schemaNs from "./schema.js";

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema: schemaNs });
export const schema = schemaNs;
type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
