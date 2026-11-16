import express, { Router } from 'express';
import { startViewSchema } from '@kaned/shared';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as service from './activity.service.js';

export const activityRouter = Router();

/** The app opened a page; returns the token its check-ins carry. */
activityRouter.post('/views', requireAuth, validateBody(startViewSchema), async (req, res) => {
  res.status(201).json(await service.startView(req.user!.id, req.body, req));
});

/**
 * Check-ins come from navigator.sendBeacon, which cannot set headers, so they
 * are plain text and authenticated by the sealed view token instead.
 */
activityRouter.post('/ping', express.text({ type: () => true, limit: '4kb' }), async (req, res) => {
  let body: { token?: unknown; seconds?: unknown; final?: unknown } = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  } catch {
    /* ignore malformed beacons */
  }
  if (typeof body.token === 'string') await service.ping(body.token, body.seconds, body.final === true);
  res.status(204).end();
});
