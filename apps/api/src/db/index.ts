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

let pool = globalForDb.sql ?? createClient();
if (!env.isProd) globalForDb.sql = pool;

/* ───────────────────────────── query watchdog ─────────────────────────────
 * On Vercel a pooled socket can die without either side noticing (the
 * instance was frozen, the pooler moved on). Every query on it then waits
 * forever. With the watchdog on, a query still unanswered after
 * QUERY_TIMEOUT_MS throws the pool away; a read is run once more on the fresh
 * pool, a write fails fast instead (it may have reached the server).
 * Only the API server turns it on — migrations may run long on purpose. */

const QUERY_TIMEOUT_MS = 6_000;
let watchdog = false;
export function enableQueryWatchdog() {
  watchdog = true;
}

class QueryTimeout extends Error {
  constructor() {
    super('The database did not answer in time.');
    this.name = 'QueryTimeout';
  }
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  // The losing promise may still reject later (the old pool closing); keep that quiet.
  promise.catch(() => undefined);
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new QueryTimeout()), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const READ = /^\s*(select|with)\b/i;
const WRITE = /\b(insert|update|delete)\b/i;

async function guarded<T>(query: string, run: () => Promise<T>): Promise<T> {
  if (!watchdog) return run();
  try {
    return await within(run(), QUERY_TIMEOUT_MS);
  } catch (e) {
    if (!(e instanceof QueryTimeout)) throw e;
    resetDb(`a query waited ${QUERY_TIMEOUT_MS / 1000}s`);
    if (READ.test(query) && !WRITE.test(query)) return within(run(), QUERY_TIMEOUT_MS);
    throw e;
  }
}

type Sql = ReturnType<typeof postgres>;

/**
 * What the rest of the code talks to: always the current pool, with the
 * watchdog around `unsafe` (every Drizzle query goes through it).
 */
const current = new Proxy(function sql() {} as unknown as Sql, {
  apply: (_t, _this, args: unknown[]) => (pool as unknown as (...a: unknown[]) => unknown)(...args),
  get(_t, prop) {
    if (prop === 'unsafe') {
      return (query: string, params?: unknown[], options?: unknown) => {
        const make = () => pool.unsafe(query, params as never, options as never);
        return {
          values: () => guarded(query, () => make().values() as Promise<unknown>),
          then: (ok?: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => guarded(query, () => make() as Promise<unknown>).then(ok, fail),
          catch: (fail: (e: unknown) => unknown) => guarded(query, () => make() as Promise<unknown>).catch(fail),
        };
      };
    }
    const value = Reflect.get(pool, prop) as unknown;
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(pool) : value;
  },
});

export const db = drizzle(current, { schema, logger: false });
export const sqlClient = current;
export * as schema from './schema.js';
export type Db = typeof db;

/** Throws the pool away and starts a new one; old sockets are closed in the background. */
export function resetDb(reason: string) {
  const old = pool;
  pool = createClient();
  if (!env.isProd) globalForDb.sql = pool;
  console.warn(`[db] new connection pool (${reason})`);
  // Queries still running on the old pool get time to finish.
  old.end({ timeout: 10 }).catch(() => undefined);
}
/*
 * A request that hangs asks for a fresh pool, but the swap waits until no
 * other request is running, so a healthy query is never cut off midway.
 */
let resetWanted: string | null = null;
export function requestDbReset(reason: string) {
  resetWanted = reason;
  if (inFlight === 0) {
    resetWanted = null;
    resetDb(reason);
  }
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
    if (inFlight === 0 && resetWanted) {
      const why = resetWanted;
      resetWanted = null;
      resetDb(why);
    }
  };
}
