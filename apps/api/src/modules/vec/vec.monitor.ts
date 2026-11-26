import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  DISCONNECT_AFTER_MS,
  VIOLATION_LABEL,
  riskLevel,
  type MonitorDto,
  type MonitorEvent,
  type MonitorRow,
  type VecSettings,
  type ViolationType,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { vecAttemptEvents, vecAttempts, vecParticipants, vecSessions, vecUnlockRequests, type VecAttemptRow, type VecSessionRow } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { audit, countsFor, loadHostedSession, ms, statusOf, toSessionDto } from './vec.common.js';
import { peMonitorInfo } from './vec.pe.js';
import { createAttempt, deadlineOf, finalizeAttempt, logEvent, nextAttemptNo, recomputeCounted, settleSession, voidAttempt } from './vec.engine.js';

async function hostedAttempt(attemptId: string, userId: string, role: string): Promise<{ attempt: VecAttemptRow; session: VecSessionRow }> {
  const [a] = await db.select().from(vecAttempts).where(eq(vecAttempts.id, attemptId)).limit(1);
  if (!a) throw ApiError.notFound('Không tìm thấy bài thi.');
  const session = await loadHostedSession(a.sessionId, userId, role);
  return { attempt: a, session };
}

export async function monitor(sessionId: string, userId: string, role: string, since: number): Promise<MonitorDto> {
  let s = await loadHostedSession(sessionId, userId, role);
  s = await settleSession(s);
  const now = Date.now();
  const settings = s.settings as VecSettings;
  const parts = await db.select().from(vecParticipants).where(eq(vecParticipants.sessionId, sessionId));
  const atts = await db.select().from(vecAttempts).where(eq(vecAttempts.sessionId, sessionId)).orderBy(asc(vecAttempts.attemptNo));
  const latest = new Map<string, VecAttemptRow>();
  const maxNo = new Map<string, number>();
  for (const a of atts) {
    latest.set(a.userId, a);
    maxNo.set(a.userId, a.attemptNo);
  }
  const total = s.questionCount;
  const peInfo = s.kind === 'PE' ? await peMonitorInfo(sessionId) : null;
  const rows: MonitorRow[] = [];
  for (const p of parts) {
    const a = latest.get(p.userId);
    if (!a) continue;
    const info = p.candidateInfo;
    rows.push({
      attemptId: a.id,
      userId: p.userId,
      fullName: info.fullName ?? '',
      accountName: info.accountName ?? '',
      email: info.email ?? '',
      studentCode: info.studentCode ?? '',
      state: a.state as MonitorRow['state'],
      attemptNo: a.attemptNo,
      maxAttempts: settings.retake.max + 1,
      paperCode: a.paperCode,
      answered: a.answeredCount,
      total,
      current: a.currentIndex,
      lastSeenAt: ms(a.lastSeenAt),
      online: a.lastSeenAt ? now - a.lastSeenAt.getTime() < DISCONNECT_AFTER_MS : false,
      fullscreen: a.fullscreen,
      lock: atts.filter((x) => x.userId === p.userId).reduce((n, x) => n + x.violationLock, 0),
      warn: atts.filter((x) => x.userId === p.userId).reduce((n, x) => n + x.violationWarn, 0),
      risk: atts.filter((x) => x.userId === p.userId).reduce((n, x) => n + x.riskScore, 0),
      deadlineAt: deadlineOf(a, s, now),
      ip: a.lastIp,
      countedScore: p.countedScore10,
      score10: a.score10,
      lockReason: a.lockReason,
      lockedAt: ms(a.lockedAt),
      ...(peInfo ? { pe: { ...(peInfo.get(a.id) ?? { submissions: 0, lastAt: null, bytes: 0 }), closed: Boolean(a.peClosedAt) } } : {}),
    });
  }
  const names = new Map(rows.map((r) => [r.attemptId, r.fullName]));
  const evWhere = since > 0 ? and(eq(vecAttemptEvents.sessionId, sessionId), gt(vecAttemptEvents.id, since)) : eq(vecAttemptEvents.sessionId, sessionId);
  const evRows = await db.select().from(vecAttemptEvents).where(evWhere).orderBy(since > 0 ? asc(vecAttemptEvents.id) : desc(vecAttemptEvents.id)).limit(since > 0 ? 300 : 60);
  const ordered = since > 0 ? evRows : evRows.reverse();
  const events: MonitorEvent[] = ordered
    .filter((e) => e.type !== 'STARTED' || true)
    .map((e) => {
      const a = atts.find((x) => x.id === e.attemptId);
      return {
        id: e.id,
        attemptId: e.attemptId,
        userId: a?.userId ?? '',
        name: names.get(e.attemptId) ?? '—',
        type: e.type,
        label: (VIOLATION_LABEL as Record<string, string>)[e.type] ?? EVENT_LABEL[e.type] ?? e.type,
        severity: e.severity as MonitorEvent['severity'],
        at: e.createdAt.getTime(),
        data: e.data,
      };
    });
  const cursor = ordered.length ? ordered[ordered.length - 1]!.id : since;
  const reqs = await db.select().from(vecUnlockRequests).where(and(eq(vecUnlockRequests.sessionId, sessionId), eq(vecUnlockRequests.status, 'PENDING'))).orderBy(asc(vecUnlockRequests.createdAt));
  const counts = (await countsFor([sessionId])).get(sessionId);
  return {
    serverNow: now,
    session: await toSessionDto(s, { host: true, counts }),
    rows,
    events,
    cursor,
    requests: reqs.map((r) => {
      const a = atts.find((x) => x.id === r.attemptId);
      return { id: r.id, attemptId: r.attemptId, name: names.get(r.attemptId) ?? '—', kind: r.kind as 'UNLOCK' | 'RETAKE', reason: r.reason, lockReason: a?.lockReason ?? null, at: r.createdAt.getTime() };
    }),
  };
}

const EVENT_LABEL: Record<string, string> = {
  STARTED: 'Bắt đầu làm bài',
  PE_SUBMIT: 'Nộp bài làm',
  PE_SUBMIT_LATE: 'Nộp bài làm (sát giờ)',
  PE_CLOSE: 'Ký danh sách và đóng phòng thi',
  PE_PAPER: 'Mở đề thi',
  PE_MATERIAL: 'Tải tài liệu kèm theo',
  UNLOCK_REQUEST: 'Xin mở khóa',
  RETAKE_REQUEST: 'Xin làm lại',
  LECTURER_RESUME: 'Giảng viên mở khóa',
  LECTURER_REDO: 'Giảng viên cho làm lại',
  LECTURER_REMOVE: 'Giảng viên loại khỏi phòng',
  LECTURER_FORCE_SUBMIT: 'Giảng viên thu bài',
};

export async function resumeAttempt(attemptId: string, userId: string, role: string, bonus: 'NONE' | 'LOCKED_TIME' | 'CUSTOM', bonusMin?: number) {
  const { attempt: a, session: s } = await hostedAttempt(attemptId, userId, role);
  if (a.state !== 'SUSPENDED') throw ApiError.conflict('Bài thi không đang bị khóa.');
  if (statusOf(s) === 'ENDED') throw ApiError.conflict('Phiên đã kết thúc.');
  const now = Date.now();
  let add = 0;
  if (bonus === 'LOCKED_TIME' && a.lockedAt) add = Math.max(0, Math.floor((now - a.lockedAt.getTime()) / 1000));
  if (bonus === 'CUSTOM') add = (bonusMin ?? 0) * 60;
  const [u] = await db
    .update(vecAttempts)
    .set({ state: 'IN_PROGRESS', lockReason: null, resumedAt: new Date(now), timeBonusSec: sql`${vecAttempts.timeBonusSec} + ${add}`, version: sql`${vecAttempts.version} + 1` })
    .where(and(eq(vecAttempts.id, a.id), eq(vecAttempts.state, 'SUSPENDED')))
    .returning({ id: vecAttempts.id });
  if (!u) throw ApiError.conflict('Bài thi vừa đổi trạng thái, hãy tải lại.');
  await db.update(vecUnlockRequests).set({ status: 'APPROVED', decidedBy: userId, decidedAt: new Date() }).where(and(eq(vecUnlockRequests.attemptId, a.id), eq(vecUnlockRequests.status, 'PENDING'), eq(vecUnlockRequests.kind, 'UNLOCK')));
  await logEvent(a, 'LECTURER_RESUME', 'INFO', { bonusSec: add }, userId);
  await audit(s.id, userId, 'ATTEMPT_RESUME', a.id, { bonusSec: add });
  return { ok: true };
}

export async function forceSubmit(attemptId: string, userId: string, role: string) {
  const { attempt: a, session: s } = await hostedAttempt(attemptId, userId, role);
  const done = await finalizeAttempt(a, 'FORCE_SUBMITTED', 'LECTURER');
  if (!done) throw ApiError.conflict('Bài thi đã kết thúc.');
  await logEvent(a, 'LECTURER_FORCE_SUBMIT', 'INFO', {}, userId);
  await audit(s.id, userId, 'ATTEMPT_FORCE_SUBMIT', a.id);
  return { ok: true };
}

/** Throws the current attempt away and gives the candidate a fresh paper. */
export async function redoAttempt(attemptId: string, userId: string, role: string, countsTowardLimit: boolean, reason?: string) {
  const { attempt: a, session: s } = await hostedAttempt(attemptId, userId, role);
  if (statusOf(s) === 'ENDED' || statusOf(s) === 'CANCELLED') throw ApiError.conflict('Phiên đã kết thúc.');
  if (!['IN_PROGRESS', 'SUSPENDED', 'LOBBY'].includes(a.state)) throw ApiError.conflict('Chỉ cho làm lại khi bài đang mở hoặc bị khóa.');
  const voided = await voidAttempt(a, 'REDO');
  if (!voided) throw ApiError.conflict('Bài thi vừa đổi trạng thái, hãy tải lại.');
  const no = await nextAttemptNo(s.id, a.userId);
  const next = await createAttempt(s.id, a.userId, no, countsTowardLimit);
  if (countsTowardLimit) await db.update(vecParticipants).set({ retakesUsed: sql`${vecParticipants.retakesUsed} + 1` }).where(and(eq(vecParticipants.sessionId, s.id), eq(vecParticipants.userId, a.userId)));
  await db.update(vecUnlockRequests).set({ status: 'REDO', decidedBy: userId, decidedAt: new Date() }).where(and(eq(vecUnlockRequests.attemptId, a.id), eq(vecUnlockRequests.status, 'PENDING')));
  await logEvent(a, 'LECTURER_REDO', 'INFO', { reason: reason ?? '', countsTowardLimit }, userId);
  await audit(s.id, userId, 'ATTEMPT_REDO', a.id, { next: next.id, countsTowardLimit });
  return { attemptId: next.id };
}

export async function removeCandidate(attemptId: string, userId: string, role: string, mode: 'GRADE_SAVED' | 'VOID', reason: string) {
  const { attempt: a, session: s } = await hostedAttempt(attemptId, userId, role);
  const done = mode === 'VOID' ? await voidAttempt(a, 'REMOVED') : await finalizeAttempt(a, 'FORCE_SUBMITTED', 'REMOVED');
  if (!done) throw ApiError.conflict('Bài thi đã kết thúc.');
  // A removed candidate cannot take a retake either.
  await db.update(vecParticipants).set({ extraRetakes: -100 }).where(and(eq(vecParticipants.sessionId, s.id), eq(vecParticipants.userId, a.userId)));
  await db.update(vecUnlockRequests).set({ status: 'DENIED', decidedBy: userId, decidedAt: new Date() }).where(and(eq(vecUnlockRequests.attemptId, a.id), eq(vecUnlockRequests.status, 'PENDING')));
  await recomputeCounted(s.id, a.userId);
  await logEvent(a, 'LECTURER_REMOVE', 'INFO', { mode, reason }, userId);
  await audit(s.id, userId, 'ATTEMPT_REMOVE', a.id, { mode, reason });
  return { ok: true };
}

export async function grantRetakes(sessionId: string, candidateId: string, userId: string, role: string, delta: number) {
  const s = await loadHostedSession(sessionId, userId, role);
  if (statusOf(s) === 'ENDED' || statusOf(s) === 'CANCELLED') throw ApiError.conflict('Phiên đã kết thúc.');
  const [u] = await db
    .update(vecParticipants)
    .set({ extraRetakes: sql`greatest(${vecParticipants.extraRetakes} + ${delta}, -100)` })
    .where(and(eq(vecParticipants.sessionId, sessionId), eq(vecParticipants.userId, candidateId)))
    .returning({ extra: vecParticipants.extraRetakes });
  if (!u) throw ApiError.notFound('Không tìm thấy thí sinh.');
  await audit(sessionId, userId, 'GRANT_RETAKES', candidateId, { delta });
  return { extraRetakes: u.extra };
}

export async function decideRequest(requestId: string, userId: string, role: string, approve: boolean, note?: string) {
  const [r] = await db.select().from(vecUnlockRequests).where(eq(vecUnlockRequests.id, requestId)).limit(1);
  if (!r) throw ApiError.notFound('Không tìm thấy yêu cầu.');
  const { attempt: a, session: s } = await hostedAttempt(r.attemptId, userId, role);
  if (r.status !== 'PENDING') throw ApiError.conflict('Yêu cầu này đã được xử lý.');
  if (r.kind === 'UNLOCK') {
    if (approve) return resumeAttempt(a.id, userId, role, 'NONE');
    await db.update(vecUnlockRequests).set({ status: 'DENIED', decidedBy: userId, decidedAt: new Date() }).where(eq(vecUnlockRequests.id, r.id));
    await audit(s.id, userId, 'REQUEST_DENY', a.id, { note });
    return { ok: true };
  }
  await db.update(vecUnlockRequests).set({ status: approve ? 'APPROVED' : 'DENIED', decidedBy: userId, decidedAt: new Date() }).where(eq(vecUnlockRequests.id, r.id));
  await db
    .update(vecParticipants)
    .set(approve ? { retakeApprovedAt: new Date() } : { retakeRequestedAt: null, retakeRequestNote: null })
    .where(and(eq(vecParticipants.sessionId, s.id), eq(vecParticipants.userId, a.userId)));
  await audit(s.id, userId, approve ? 'RETAKE_APPROVE' : 'RETAKE_DENY', a.id, { note });
  return { ok: true };
}

export { inArray, riskLevel, vecSessions };
export type { ViolationType };
