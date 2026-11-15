import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@kaned/shared';
import { env } from '../env.js';

export interface AccessPayload {
  sub: string;
  email: string;
  role: Role;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'kaned',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'kaned' }) as AccessPayload;
}

/**
 * Refresh tokens are opaque random strings. Only their hash is stored, so a
 * leaked database row cannot be replayed against the API.
 */
export function createRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(48).toString('base64url');
  return {
    token,
    hash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}
