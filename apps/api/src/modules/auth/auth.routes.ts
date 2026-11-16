import { Router, type Response } from 'express';
import { loginSchema, registerSchema, setPasswordSchema, updateProfileSchema } from '@kaned/shared';
import { validateBody } from '../../middleware/validate.js';
import { idempotent } from '../../middleware/idempotency.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter, oauthLimiter } from '../../middleware/rateLimit.js';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from '../../lib/cookies.js';
import { env } from '../../env.js';
import * as service from './auth.service.js';
import * as oauth from './oauth/oauth.service.js';
import { updateProfile } from '../users/users.service.js';

export const authRouter = Router();

/** What the client needs to know before it renders the sign-in screen. */
authRouter.get('/config', (_req, res) => {
  res.json(oauth.authConfig());
});

authRouter.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const session = await service.register(req.body, req.headers['user-agent']);
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  res.status(201).json({ user: session.user, accessToken: session.accessToken });
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const session = await service.login(req.body.email, req.body.password, req.headers['user-agent']);
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  res.json({ user: session.user, accessToken: session.accessToken });
});

/* ───────────────────── sign-in with an outside account ───────────────────── */

function stateCookie(res: Response, value: string | null) {
  const options = {
    httpOnly: true,
    secure: env.isProd,
    // Lax still travels on the provider's top-level redirect back to us.
    sameSite: 'lax' as const,
    path: oauth.STATE_COOKIE_PATH,
  };
  if (value) res.cookie(oauth.STATE_COOKIE, value, { ...options, maxAge: oauth.STATE_TTL_MS });
  else res.clearCookie(oauth.STATE_COOKIE, options);
}

authRouter.get('/oauth/:provider/start', oauthLimiter, (req, res) => {
  const result = oauth.startFlow(req.params.provider, req.query);
  if (result.cookie) stateCookie(res, result.cookie);
  res.set('Cache-Control', 'no-store');
  res.redirect(302, result.redirect);
});

authRouter.get('/oauth/:provider/callback', oauthLimiter, async (req, res) => {
  const result = await oauth.completeFlow(req.params.provider, req.query, req.cookies?.[oauth.STATE_COOKIE]);
  // One sign-in, one state: the cookie is spent whatever happened.
  stateCookie(res, null);
  if (result.signInUserId) {
    const session = await service.issueSession(result.signInUserId, req.headers['user-agent']);
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  }
  res.set('Cache-Control', 'no-store');
  res.redirect(302, result.redirect);
});

/** Starts linking a provider to the signed-in account (see oauth.service). */
authRouter.post('/oauth/:provider/link', requireAuth, (req, res) => {
  res.json({ url: oauth.linkTicketUrl(req.user!.id, req.params.provider, req.body?.next) });
});

authRouter.get('/security', requireAuth, async (req, res) => {
  res.json(await oauth.accountSecurity(req.user!.id));
});

authRouter.delete('/identities/:provider', requireAuth, idempotent(), async (req, res) => {
  res.json(await oauth.unlinkIdentity(req.user!.id, req.params.provider));
});

authRouter.post(
  '/password',
  requireAuth,
  authLimiter,
  idempotent({ redact: ['currentPassword', 'newPassword'] }),
  validateBody(setPasswordSchema),
  async (req, res) => {
    const { hadPassword } = await service.setPassword(req.user!.id, req.body);
    // A new password signs out every other device; this one stays signed in.
    if (hadPassword) await oauth.revokeOtherSessions(req.user!.id, req.cookies?.[REFRESH_COOKIE]);
    res.json(await oauth.accountSecurity(req.user!.id));
  },
);

/* ─────────────────────────────── sessions ─────────────────────────────── */

authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  const session = await service.refreshSession(token, req.headers['user-agent']);
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  res.json({ user: session.user, accessToken: session.accessToken });
});

authRouter.post('/logout', async (req, res) => {
  await service.revokeSession(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await service.currentUser(req.user!.id));
});

authRouter.patch('/me', requireAuth, idempotent(), validateBody(updateProfileSchema), async (req, res) => {
  res.json(await updateProfile(req.user!.id, req.body));
});
