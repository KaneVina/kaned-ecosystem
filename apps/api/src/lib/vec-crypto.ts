import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { env } from '../env.js';

/** Base32 without I, O, 0, 1: easy to read out loud. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * The browser never sees which option is right, nor even the option's position
 * in the stored question. It gets an opaque id per option; only the server,
 * which holds the attempt's seed, can turn it back into an index.
 */
export function oidFor(seed: string, qid: string, idx: number, salt = 0): string {
  const mac = createHmac('sha256', seed).update(`${qid}|${idx}|${salt}`).digest();
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[mac[i]! % ALPHABET.length];
  return out;
}

/** Ids for every option of one question, guaranteed distinct. */
export function oidsFor(seed: string, qid: string, count: number): string[] {
  for (let salt = 0; salt < 20; salt++) {
    const ids = Array.from({ length: count }, (_, i) => oidFor(seed, qid, i, salt));
    if (new Set(ids).size === count) return ids;
  }
  throw new Error('could not derive distinct option ids');
}

/** 7 digits, first one 1–9, from the system CSPRNG. */
export function newRoomCode(): string {
  return String(randomInt(1_000_000, 10_000_000));
}

export const newOtp = () => String(randomInt(100_000, 1_000_000));
export const newSeed = () => randomBytes(18).toString('hex');
export const newConnectionId = () => randomBytes(12).toString('base64url');

const otpKey = () => createHash('sha256').update(`kaned:vec-otp:${env.JWT_REFRESH_SECRET}`).digest();

/** The host can read the OTP back, so it is encrypted rather than hashed. */
export function encryptOtp(otp: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', otpKey(), iv);
  const body = Buffer.concat([c.update(otp, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}

export function decryptOtp(enc: string | null): string | null {
  if (!enc) return null;
  try {
    const raw = Buffer.from(enc, 'base64url');
    const d = createDecipheriv('aes-256-gcm', otpKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export const uaHash = (ua: string | undefined) => createHash('sha1').update(ua ?? '').digest('hex').slice(0, 16);
