import { Router } from 'express';
import {
  googleAuthSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '@kaned/shared';
import { validateBody } from '../../middleware/validate.js';
import { idempotent } from '../../middleware/idempotency.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from '../../lib/cookies.js';
import { env } from '../../env.js';
import * as service from './auth.service.js';
import { updateProfile } from '../users/users.service.js';

export const authRouter = Router();

/** What the client needs to know before it renders the sign-in screen. */
authRouter.get('/config', (_req, res) => {
  res.json({
    googleEnabled: env.googleEnabled,
    googleClientId: env.GOOGLE_CLIENT_ID || null,
  });
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

authRouter.post('/google', authLimiter, validateBody(googleAuthSchema), async (req, res) => {
  const session = await service.loginWithGoogle(req.body.credential, req.headers['user-agent']);
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  res.json({ user: session.user, accessToken: session.accessToken });
});

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
