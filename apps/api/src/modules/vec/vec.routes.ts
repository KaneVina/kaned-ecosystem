import { Router, type Request, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  announceSchema,
  answerItemSchema,
  answersPutSchema,
  confirmCodeSchema,
  decideRequestSchema,
  extendTimeSchema,
  heartbeatSchema,
  joinEnterSchema,
  joinLookupSchema,
  joinOtpSchema,
  lockDecisionSchema,
  redoSchema,
  removeSchema,
  resumeSchema,
  retakeGrantSchema,
  sessionInputSchema,
  sessionPatchSchema,
  unlockRequestSchema,
  violationSchema,
  peCloseSchema,
  peGradeSchema,
  peSignSchema,
  peSubmitSchema,
} from '@kaned/shared';
import { env } from '../../env.js';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
import { validateBody } from '../../middleware/validate.js';
import { timingSafeEqual } from 'node:crypto';
import * as sessions from './vec.sessions.js';
import * as join from './vec.join.js';
import * as attempts from './vec.attempts.js';
import * as mon from './vec.monitor.js';
import { tick } from './vec.tick.js';
import * as pe from './vec.pe.js';

/** /api/vec — Virtual Exam Center. */
export const vecRouter = Router();

vecRouter.use((_req, _res, next) => (env.vecEnabled ? next() : next(ApiError.notFound('Phòng thi ảo đang tạm tắt.'))));

// The scheduler's call authenticates with a shared secret, not a user.
// Vercel's daily cron: GET with "Authorization: Bearer <CRON_SECRET>".
vecRouter.get('/internal/tick', async (req, res) => {
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ''}`);
  const given = Buffer.from(String(req.get('authorization') ?? ''));
  if (!process.env.CRON_SECRET || given.length !== want.length || !timingSafeEqual(given, want)) throw ApiError.unauthorized();
  res.json(await tick());
});
vecRouter.post('/internal/tick', async (req, res) => {
  const given = Buffer.from(String(req.get('x-vec-secret') ?? ''));
  const want = Buffer.from(env.VEC_FINALIZER_SECRET);
  if (!want.length || given.length !== want.length || !timingSafeEqual(given, want)) throw ApiError.unauthorized();
  res.json(await tick());
});

/* ── PE files moved with signed tickets (no session header: plain links and frames) ── */
vecRouter.post('/blob/:id', async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await pe.receiveBlob(req, id(req), String(req.query.t ?? '')));
});
vecRouter.get('/blob/:id', async (req, res) => {
  await pe.sendBlob(res, id(req), String(req.query.t ?? ''), req.query.dl === '1');
});
vecRouter.get('/embed/:id/:ticket', async (req, res) => {
  await pe.embedPage(req, res, id(req), String(req.params.ticket));
});
vecRouter.get('/embed/:id/:ticket/file', async (req, res) => {
  await pe.embedFile(req, res, id(req), String(req.params.ticket));
});

vecRouter.use(requireAuth);

const u = (req: Request) => req.user!.id;
const role = (req: Request) => req.user!.role;
const id = (req: Request) => String(req.params.id);

/** Exam traffic is keyed by person, not address: a lab behind one IP must not throttle itself. */
const examLimiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  keyGenerator: (req) => `vec:${req.user?.id ?? req.ip}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu, thử lại sau giây lát.' } },
});
const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  keyGenerator: (req) => `vecw:${req.user?.id ?? req.ip}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Quá nhiều thao tác, thử lại sau giây lát.' } },
});
const wrap = (fn: (req: Request) => Promise<unknown>): RequestHandler => async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await fn(req));
};

/* ── hub & lookups ── */
vecRouter.get('/me', wrap(async (r) => {
  await pe.lazySweep();
  return join.meState(u(r));
}));
vecRouter.get('/me/prefill', wrap((r) => join.prefill(u(r))));
vecRouter.get('/decks', wrap(() => sessions.listDecksForHost()));

/* ── joining (candidate) ── */
vecRouter.post('/join/lookup', writeLimiter, validateBody(joinLookupSchema), wrap((r) => join.lookup(r, u(r), r.body.code)));
vecRouter.post('/join/otp', writeLimiter, validateBody(joinOtpSchema), wrap((r) => join.lookup(r, u(r), r.body.code, r.body.otp)));
vecRouter.post('/join/enter', writeLimiter, validateBody(joinEnterSchema), wrap((r) => join.enter(r, u(r), r.body.ticket, r.body.info)));

/* ── hosting ── */
vecRouter.get('/sessions', wrap(async (r) => {
  await pe.lazySweep();
  return sessions.listHosted(u(r));
}));

/* ── PE: library picker, uploads, grading ── */
vecRouter.get('/pe/library', wrap((r) => pe.libraryPick(String(r.query.q ?? ''), u(r))));
vecRouter.post('/pe/files/sign', writeLimiter, validateBody(peSignSchema), wrap((r) => pe.signFile(u(r), r.body)));
vecRouter.post('/pe/files/:id/finish', wrap((r) => pe.finishDraft(u(r), id(r))));
vecRouter.delete('/pe/files/:id', wrap((r) => pe.dropDraft(u(r), id(r))));
vecRouter.get('/pe/files/:id/link', wrap((r) => pe.hostFileLink(id(r), u(r), role(r))));
vecRouter.get('/pe/submissions/:id/link', wrap((r) => pe.submissionFileId(id(r), u(r), role(r))));
vecRouter.get('/sessions/:id/pe/grading', wrap((r) => pe.grading(id(r), u(r), role(r))));
vecRouter.get('/sessions/:id/pe/paper', wrap((r) => pe.hostPaper(id(r), u(r), role(r))));
vecRouter.get('/sessions/:id/pe/items/:ref', wrap((r) => pe.hostMaterial(id(r), String(r.params.ref), u(r), role(r))));
vecRouter.get('/sessions/:id/pe/latest', wrap((r) => pe.latestFiles(id(r), u(r), role(r))));
vecRouter.put('/attempts/:id/pe/grade', validateBody(peGradeSchema), wrap((r) => pe.gradeAttempt(id(r), u(r), role(r), r.body)));
vecRouter.post('/sessions', writeLimiter, idempotent(), validateBody(sessionInputSchema), async (req, res) => {
  res.status(201).json(await sessions.createSession(u(req), req.body));
});
vecRouter.get('/sessions/:id', wrap((r) => sessions.getHosted(id(r), u(r), role(r))));
vecRouter.patch('/sessions/:id', validateBody(sessionPatchSchema), wrap((r) => sessions.patchSession(id(r), u(r), role(r), r.body)));
vecRouter.delete('/sessions/:id', validateBody(confirmCodeSchema), wrap((r) => sessions.deleteSession(id(r), u(r), role(r), r.body.confirm)));
vecRouter.post('/sessions/:id/pause', wrap((r) => sessions.pauseSession(id(r), u(r), role(r))));
vecRouter.post('/sessions/:id/resume', wrap((r) => sessions.resumeSession(id(r), u(r), role(r))));
vecRouter.post('/sessions/:id/end', wrap((r) => sessions.endSession(id(r), u(r), role(r))));
vecRouter.post('/sessions/:id/cancel', wrap((r) => sessions.cancelSession(id(r), u(r), role(r))));
vecRouter.post('/sessions/:id/postpone', validateBody(z.object({ startsAt: z.string().min(10).max(40) })), wrap((r) => sessions.postponeSession(id(r), u(r), role(r), r.body.startsAt)));
vecRouter.post('/sessions/:id/announce', validateBody(announceSchema), wrap((r) => sessions.announce(id(r), u(r), role(r), r.body.body, r.body.urgent, r.body.attemptId)));
vecRouter.post('/sessions/:id/extend', validateBody(extendTimeSchema), wrap((r) => sessions.extendTime(id(r), u(r), role(r), r.body.minutes, r.body.attemptIds)));
vecRouter.post('/sessions/:id/release-results', wrap((r) => sessions.releaseResults(id(r), u(r), role(r))));
vecRouter.get('/sessions/:id/monitor', wrap((r) => mon.monitor(id(r), u(r), role(r), Math.max(0, Number(r.query.since) || 0))));
vecRouter.get('/sessions/:id/results', wrap((r) => sessions.sessionResults(id(r), u(r), role(r))));
vecRouter.get('/sessions/:id/results.csv', async (req, res) => {
  const out = await sessions.resultsCsv(id(req), u(req), role(req));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${out.name}"`, 'Cache-Control': 'no-store' }).send(out.body);
});
vecRouter.post('/sessions/:id/candidates/:userId/retakes', validateBody(retakeGrantSchema), wrap((r) => mon.grantRetakes(id(r), String(r.params.userId), u(r), role(r), r.body.delta)));

/* ── lecturer actions on one attempt ── */
vecRouter.post('/attempts/:id/resume-lock', validateBody(resumeSchema), wrap((r) => mon.resumeAttempt(id(r), u(r), role(r), r.body.bonus, r.body.bonusMin)));
vecRouter.post('/attempts/:id/force-submit', wrap((r) => mon.forceSubmit(id(r), u(r), role(r))));
vecRouter.post('/attempts/:id/redo', validateBody(redoSchema), wrap((r) => mon.redoAttempt(id(r), u(r), role(r), r.body.countsTowardLimit, r.body.reason)));
vecRouter.post('/attempts/:id/remove', validateBody(removeSchema), wrap((r) => mon.removeCandidate(id(r), u(r), role(r), r.body.mode, r.body.reason)));
vecRouter.post('/requests/:id/decide', validateBody(decideRequestSchema), wrap((r) => mon.decideRequest(id(r), u(r), role(r), r.body.approve, r.body.note)));

/* ── candidate, during and after the exam ── */
vecRouter.use('/attempts', examLimiter);
vecRouter.get('/attempts/:id', wrap((r) => attempts.attemptState(id(r), u(r))));
vecRouter.post('/attempts/:id/start', wrap((r) => attempts.startAttempt(r, id(r), u(r))));
vecRouter.post('/attempts/:id/claim', validateBody(z.object({ connectionId: z.string().max(80).optional() })), wrap((r) => attempts.claimConnection(r, id(r), u(r), r.body.connectionId)));
vecRouter.get('/attempts/:id/paper', wrap((r) => attempts.getPaper(id(r), u(r))));
vecRouter.put('/attempts/:id/answers', validateBody(answersPutSchema), wrap((r) => attempts.saveAnswers(id(r), u(r), r.body.items)));
vecRouter.post('/attempts/:id/submit', validateBody(z.object({ items: z.array(answerItemSchema).max(50).optional() })), wrap((r) => attempts.submitAttempt(id(r), u(r), r.body.items)));
vecRouter.post('/attempts/:id/heartbeat', validateBody(heartbeatSchema), wrap((r) => attempts.heartbeat(r, id(r), u(r), r.body)));
vecRouter.post('/attempts/:id/violations', validateBody(violationSchema), wrap((r) => attempts.reportViolation(id(r), u(r), r.body.type, r.body.data)));
vecRouter.get('/attempts/:id/result', wrap((r) => attempts.attemptResult(id(r), u(r))));
vecRouter.get('/attempts/:id/pe', wrap((r) => pe.peRoom(u(r), id(r))));
vecRouter.get('/attempts/:id/pe/paper', wrap((r) => pe.candidatePaper(u(r), id(r))));
vecRouter.get('/attempts/:id/pe/materials/:ref', wrap((r) => pe.candidateMaterial(u(r), id(r), String(r.params.ref))));
vecRouter.get('/attempts/:id/pe/submissions/:sid', wrap((r) => pe.ownSubmissionLink(u(r), id(r), String(r.params.sid))));
vecRouter.post('/attempts/:id/pe/submit', validateBody(peSubmitSchema), wrap((r) => pe.submitSolution(u(r), id(r), r.body)));
vecRouter.post('/attempts/:id/pe/close', validateBody(peCloseSchema), wrap((r) => pe.closeRoom(u(r), id(r))));
vecRouter.post('/attempts/:id/retake', wrap((r) => attempts.startRetake(id(r), u(r))));
vecRouter.post('/attempts/:id/request', validateBody(unlockRequestSchema), wrap((r) => attempts.requestUnlock(id(r), u(r), r.body.kind, r.body.reason)));

/* ── history ── */
vecRouter.get('/history/hosted', wrap((r) => sessions.hostedHistory(u(r))));
vecRouter.get('/history/taken', wrap((r) => attempts.takenHistory(u(r))));

export { lockDecisionSchema };
