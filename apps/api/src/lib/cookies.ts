import type { Response } from 'express';
import { env } from '../env.js';

export const REFRESH_COOKIE = 'kaned_rt';

/**
 * In production the web app is on Vercel and the API on Render, so the cookie
 * is cross-site and must be SameSite=None; Secure.
 */
export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    expires: expiresAt,
    path: '/api/auth',
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    path: '/api/auth',
  });
}
