import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Pool unico por processo. Em dev o Next recarrega modulos a cada edicao, entao
 * guardamos no globalThis para nao vazar conexoes a cada hot reload.
 */
const globalForDb = globalThis as unknown as { __zapaiPool?: Pool };

const pool =
  globalForDb.__zapaiPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__zapaiPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
export type Db = typeof db;
