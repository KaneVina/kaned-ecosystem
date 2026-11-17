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

/**
 * Supabase and other PgBouncer poolers in transaction mode hand a different
 * backend to every statement, so a prepared statement from one is unknown to
 * the next. postgres-js prepares by default, which fails there with
 * "prepared statement does not exist".
 */
function isTransactionPooler(url: string): boolean {
  try {
    const { hostname, port, searchParams } = new URL(url);
    if (searchParams.get('pgbouncer') === 'true') return true;
    return hostname.includes('pooler.supabase.com') && port === '6543';
  } catch {
    return false;
  }
}

const pooled = isTransactionPooler(env.DATABASE_URL);

const serverless = Boolean(process.env.VERCEL);

function createClient() {
  return postgres(env.DATABASE_URL, {
    /*
     * A serverless instance serves several requests at once, so one slot
     * makes every request wait behind the slowest one. The transaction
     * pooler shares backends, so a few client slots cost Supabase nothing.
     */
    max: serverless ? 4 : pooled ? 4 : env.isProd ? 10 : 5,
    idle_timeout: serverless ? 5 : 20,
    max_lifetime: serverless ? 60 : 60 * 30,
    connect_timeout: 10,
    keep_alive: 15,
    ssl: needsTls(env.DATABASE_URL) ? 'require' : false,
    prepare: !pooled,
    // "already exists, skipping" notices from re-run migrations are not news.
    onnotice: () => {},
  });
}

let client = globalForDb.sql ?? createClient();
if (!env.isProd) globalForDb.sql = client;

/*
 * Live bindings: `resetDb` swaps these, and every module that imported them
 * sees the new client on its next call.
 */
export let db = drizzle(client, { schema, logger: false });
export let sqlClient = client;
export * as schema from './schema.js';
export type Db = typeof db;

/** Throws the pool away and starts a new one; old sockets are closed in the background. */
export function resetDb(reason: string) {
  const old = client;
  client = createClient();
  if (!env.isProd) globalForDb.sql = client;
  db = drizzle(client, { schema, logger: false });
  sqlClient = client;
  console.warn(`[db] new connection pool (${reason})`);
  old.end({ timeout: 2 }).catch(() => undefined);
}

/*
 * Vercel freezes an idle instance; meanwhile the Supabase pooler drops its
 * sockets, and timers that would have noticed cannot run. The next request
 * would then wait on a dead socket until the 30 s limit. So after a quiet
 * spell, with nothing in flight, start from fresh connections.
 */
const IDLE_RESET_MS = 8_000;
let lastActivity = Date.now();
let inFlight = 0;

export function beginDbWork() {
  const now = Date.now();
  if (serverless && inFlight === 0 && now - lastActivity > IDLE_RESET_MS) resetDb(`idle ${Math.round((now - lastActivity) / 1000)}s`);
  inFlight += 1;
  lastActivity = now;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    inFlight = Math.max(0, inFlight - 1);
    lastActivity = Date.now();
  };
}
