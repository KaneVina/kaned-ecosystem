import { createHash } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { and, eq, lt, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { idempotencyKeys } from '../db/schema.js';
import { ApiError } from '../lib/errors.js';

/**
 * Idempotency-Key, after the IETF httpapi draft and Stripe's behaviour.
 *
 *   first request with a key   → runs; a 2xx response is stored with the key
 *   same key, same request     → the stored response is sent again
 *                                (header Idempotent-Replayed: true), nothing runs
 *   same key, other request    → 422, a key names exactly one operation
 *   same key while it is still running → 409 with Retry-After
 *
 * Only successful responses are kept. A 4xx or 5xx releases the key, so the
 * client can correct the request — or retry after an outage — with the same
 * key it already has. Keys belong to one caller and live for 24 hours.
 */

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[\x21-\x7E]{8,255}$/;
const TTL_MS = 24 * 60 * 60 * 1000;
/** A key stuck in "processing" this long belonged to a request that died. */
const STALE_MS = 60 * 1000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** JSON with sorted keys, so {a,b} and {b,a} hash the same. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function fingerprint(req: Request, path: string, redact: string[]) {
  // Multipart bodies are parsed later by multer; the size stands in for them.
  let payload: unknown = req.body ?? {};
  if (redact.length && payload && typeof payload === 'object') {
    // Secrets (passwords) never reach the ledger, not even as a hash.
    payload = Object.fromEntries(
      Object.entries(payload as Record<string, unknown>).map(([k, v]) => [k, redact.includes(k) && v != null ? '[redacted]' : v]),
    );
  }
  const body = req.is('multipart/form-data') ? `multipart:${req.get('content-length') ?? '0'}` : stableStringify(payload);
  return createHash('sha256').update(`${req.method} ${path}\n${body}`).digest('hex');
}

let sweepCounter = 0;
async function sweepExpired() {
  // Cheap housekeeping: every 50th reservation clears expired keys.
  sweepCounter = (sweepCounter + 1) % 50;
  if (sweepCounter !== 0) return;
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, new Date())).catch(() => undefined);
}

/** Reserves the key; false when another request already holds it. */
async function reserve(scope: string, key: string, method: string, path: string, requestHash: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);
  const inserted = await db
    .insert(idempotencyKeys)
    .values({ scope, key, method, path, requestHash, expiresAt })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  if (inserted.length) return true;

  // Take over a key whose holder expired or died mid-request.
  const taken = await db
    .update(idempotencyKeys)
    .set({ method, path, requestHash, state: 'processing', responseStatus: null, responseBody: null, createdAt: now, expiresAt })
    .where(
      and(
        eq(idempotencyKeys.scope, scope),
        eq(idempotencyKeys.key, key),
        or(
          lt(idempotencyKeys.expiresAt, now),
          and(eq(idempotencyKeys.state, 'processing'), lt(idempotencyKeys.createdAt, new Date(now.getTime() - STALE_MS))),
        ),
      ),
    )
    .returning({ key: idempotencyKeys.key });
  return taken.length > 0;
}

export interface IdempotencyOptions {
  /** Reject requests without a key (default). */
  required?: boolean;
  /** Body fields left out of the request fingerprint, e.g. passwords. */
  redact?: string[];
}

/** Must run after the auth middleware, so keys are scoped to the caller. */
export function idempotent({ required = true, redact = [] }: IdempotencyOptions = {}): RequestHandler {
  return async (req, res, next) => {
    const key = req.get(IDEMPOTENCY_HEADER)?.trim();
    if (!key) {
      if (!required) return next();
      return next(
        new ApiError(
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'Thao tác này cần header Idempotency-Key (một chuỗi ngẫu nhiên, ví dụ UUID) để không bị thực hiện hai lần.',
        ),
      );
    }
    if (!KEY_PATTERN.test(key)) {
      return next(ApiError.badRequest('Idempotency-Key phải dài 8–255 ký tự ASCII, không có khoảng trắng.'));
    }

    const scope = req.user?.id ?? `ip:${req.ip ?? 'unknown'}`;
    const path = `${req.baseUrl}${req.path}`;
    const requestHash = fingerprint(req, path, redact);

    void sweepExpired();

    if (!(await reserve(scope, key, req.method, path, requestHash))) {
      const existing = await db.query.idempotencyKeys.findFirst({
        where: and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)),
      });
      if (!existing) {
        // Released between our insert and our read: the caller should simply retry.
        res.set('Retry-After', '1');
        return next(new ApiError(409, 'IDEMPOTENCY_KEY_IN_PROGRESS', 'Yêu cầu trước với cùng khoá vừa kết thúc, hãy thử lại.'));
      }
      if (existing.requestHash !== requestHash) {
        return next(
          new ApiError(
            422,
            'IDEMPOTENCY_KEY_REUSED',
            'Idempotency-Key này đã dùng cho một yêu cầu khác. Mỗi thao tác cần một khoá riêng.',
          ),
        );
      }
      if (existing.state !== 'done') {
        res.set('Retry-After', '2');
        return next(
          new ApiError(409, 'IDEMPOTENCY_KEY_IN_PROGRESS', 'Yêu cầu này đang được xử lý, đợi một chút rồi thử lại.'),
        );
      }
      res.set('Idempotent-Replayed', 'true');
      res.status(existing.responseStatus ?? 200);
      if (existing.responseBody === null || existing.responseBody === undefined) return res.end();
      return res.json(existing.responseBody);
    }

    // We hold the key. Remember the body, and settle the ledger before the
    // response leaves, so a retry that arrives right after sees the result.
    let body: unknown = null;
    const json = res.json.bind(res);
    res.json = ((payload: unknown) => {
      body = payload;
      return json(payload);
    }) as Response['json'];

    const end = res.end.bind(res) as (...args: unknown[]) => Response;
    let settled = false;
    res.end = ((...args: unknown[]) => {
      if (settled) return end(...args);
      settled = true;
      const status = res.statusCode;
      const where = and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key));
      const write =
        status >= 200 && status < 300
          ? db
              .update(idempotencyKeys)
              .set({ state: 'done', responseStatus: status, responseBody: body as object | null })
              .where(where)
          : db.delete(idempotencyKeys).where(where);
      write
        .catch((error) => console.error('[idempotency] could not settle key', error))
        .finally(() => end(...args));
      return res;
    }) as Response['end'];

    // A client that hangs up before we answer leaves the key to the stale rule.
    next();
  };
}

/** Router-level guard: every write needs a key, reads pass straight through. */
export function idempotentWrites(options?: IdempotencyOptions): RequestHandler {
  const guard = idempotent(options);
  return (req, res, next) => (SAFE_METHODS.has(req.method) ? next() : guard(req, res, next));
}
