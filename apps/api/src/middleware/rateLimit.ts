import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' } },
});

/** Sign-in and registration get a tighter budget. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes.' },
  },
});

/**
 * Provider redirects. Looser than authLimiter: a whole class behind one campus
 * address may sign in with Google at once, and the state cookie already stops
 * forged callbacks. Still capped, since each callback calls the provider.
 */
export const oauthLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please wait a few minutes.' },
  },
});
