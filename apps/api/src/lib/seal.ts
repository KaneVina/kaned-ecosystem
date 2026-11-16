import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../env.js';

/**
 * Small encrypted, tamper-proof envelopes (AES-256-GCM) for data that has to
 * travel through the browser but must not be read or changed there: the
 * sign-in state cookie and the one-time link ticket.
 *
 * Each purpose gets its own key, so a ticket can never be replayed as a
 * state cookie or the other way round.
 */
function keyFor(purpose: string) {
  return createHash('sha256').update(`kaned:${purpose}:${env.JWT_REFRESH_SECRET}`).digest();
}

export function seal(purpose: string, data: unknown, ttlMs: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(purpose), iv);
  const body = Buffer.from(JSON.stringify({ d: data, e: Date.now() + ttlMs }), 'utf8');
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

/** The sealed data, or null when it was altered, sealed for another purpose or has expired. */
export function unseal<T>(purpose: string, token: string | undefined | null): T | null {
  if (!token || token.length > 4096) return null;
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', keyFor(purpose), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const body = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    const parsed = JSON.parse(body.toString('utf8')) as { d: T; e: number };
    return parsed.e > Date.now() ? parsed.d : null;
  } catch {
    return null;
  }
}
