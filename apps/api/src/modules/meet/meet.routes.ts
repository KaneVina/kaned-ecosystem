import { Router, type Request, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { meetAvailabilitySchema, meetEventInputSchema, meetFinalSchema, meetJoinSchema } from '@kaned/shared';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as meet from './meet.service.js';

/** /api/meet — Hẹn họp nhóm. */
export const meetRouter = Router();

const wrap =
  (fn: (req: Request) => Promise<unknown>): RequestHandler =>
  async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await fn(req));
  };
const u = (r: Request) => r.user!.id;
const role = (r: Request) => r.user!.role;
const id = (r: Request) => String(r.params.id);
const slug = (r: Request) => String(r.params.slug).slice(0, 16);
const token = (r: Request) => (r.get('x-meet-token') || undefined)?.slice(0, 64);

// Open pages check for changes every few seconds; a whole class may share one campus address.
const pollLimiter = rateLimit({ windowMs: 60_000, limit: 2400, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu, thử lại sau.' } } });
const joinLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Thử lại sau ít phút.' } } });
const pinSchema = z.object({ pin: z.string().regex(/^\d{4}$/, 'Mã PIN gồm 4 số.') });

/* ── public: everyone with the link, signed in or not ── */
meetRouter.get('/s/:slug', optionalAuth, wrap((r) => meet.publicState(slug(r), token(r), r.user?.id)));
meetRouter.get('/s/:slug/poll', pollLimiter, optionalAuth, wrap((r) => meet.poll(slug(r), Number(r.query.v) || 0, token(r), r.user?.id)));
meetRouter.post('/s/:slug/join', joinLimiter, optionalAuth, validateBody(meetJoinSchema), wrap((r) => meet.join(slug(r), r.body, r.user?.id)));
meetRouter.put('/s/:slug/me', optionalAuth, validateBody(meetAvailabilitySchema), wrap((r) => meet.saveMine(slug(r), r.body, token(r), r.user?.id)));
meetRouter.put('/s/:slug/me/pin', joinLimiter, optionalAuth, validateBody(pinSchema), wrap((r) => meet.setPin(slug(r), r.body.pin, token(r), r.user?.id)));
meetRouter.delete('/s/:slug/me', optionalAuth, wrap((r) => meet.leave(slug(r), token(r), r.user?.id)));

/* ── the leader ── */
meetRouter.use(requireAuth);
meetRouter.get('/', wrap((r) => meet.listMine(u(r))));
meetRouter.post('/', validateBody(meetEventInputSchema), wrap((r) => meet.createEvent(u(r), r.body)));
meetRouter.get('/:id', wrap((r) => meet.getOwn(id(r), u(r), role(r))));
meetRouter.put('/:id', validateBody(meetEventInputSchema), wrap((r) => meet.updateEvent(id(r), u(r), role(r), r.body)));
meetRouter.delete('/:id', wrap((r) => meet.deleteEvent(id(r), u(r), role(r))));
meetRouter.post('/:id/final', validateBody(meetFinalSchema), wrap((r) => meet.finalize(id(r), u(r), role(r), r.body)));
meetRouter.delete('/:id/final', wrap((r) => meet.reopen(id(r), u(r), role(r))));
meetRouter.delete('/:id/participants/:pid', wrap((r) => meet.removeParticipant(id(r), String(r.params.pid), u(r), role(r))));
