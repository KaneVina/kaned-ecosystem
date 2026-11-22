import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { ApiError } from '../../lib/errors.js';
import { translate } from './translate.service.js';

export const translateRouter = Router();

// Every call goes to an outside service, so each person gets a modest budget.
const limiter = rateLimit({
  windowMs: 60_000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Bạn dịch hơi nhanh, đợi một chút rồi thử lại.' } },
});

const body = z.object({
  text: z.string().trim().min(1).max(1500),
  to: z.enum(['vi', 'en']),
});

/** Translates a passage the person highlighted. The source language is detected. */
translateRouter.post('/', requireAuth, limiter, validateBody(body), async (req, res) => {
  const { text, to } = req.body as z.infer<typeof body>;
  try {
    res.set('Cache-Control', 'private, max-age=3600');
    res.json(await translate(text, to));
  } catch {
    throw new ApiError(502, 'TRANSLATE_UNAVAILABLE', 'Chưa dịch được lúc này, thử lại sau nhé.');
  }
});
