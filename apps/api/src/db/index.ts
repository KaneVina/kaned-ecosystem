import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

/**
 * One pool for the process. `globalThis` keeps it alive across the reloads
 * tsx performs in development, which otherwise exhausts the connection limit.
 */
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

/**
 * Hosted Postgres (Neon, Supabase, Render) requires TLS; a database on this
 * machine does not have it. DATABASE_SSL=require|disable overrides the guess.
 */
function needsTls(url: string): boolean {
  if (env.DATABASE_SSL === 'require') return true;
  if (env.DATABASE_SSL === 'disable') return false;
  try {
    const { hostname } = new URL(url);
    return !['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal', 'postgres', 'db'].includes(
      hostname,
    );
  } catch {
    return true;
  }
}

const client =
  globalForDb.sql ??
  postgres(env.DATABASE_URL, {
    max: env.isProd ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: needsTls(env.DATABASE_URL) ? 'require' : false,
  });

if (!env.isProd) globalForDb.sql = client;

export const db = drizzle(client, { schema, logger: false });
export { client as sqlClient };
export * as schema from './schema.js';
export type Db = typeof db;
