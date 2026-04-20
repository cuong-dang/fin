import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schemaNs from "./schema";

export const client = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(client, { schema: schemaNs });
export const schema = schemaNs;
export type Db = typeof db;
export type PgTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
