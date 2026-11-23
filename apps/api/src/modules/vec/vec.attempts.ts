import type { Request } from 'express';
import { and, asc, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import {
  DISCONNECT_AFTER_MS,
  LATE_SYNC_GRACE_MS,
  buildPaper,
  canStartRetake,
  countedScore,
  gradeLabel,
  initialDeadline,
  isActiveAttempt,
  isFinishedAttempt,
  retakeQuota,
  type AnswerItem,
  type AttemptResultDto,
  type AttemptStateDto,
  type HeartbeatCommand,
  type HeartbeatResponse,
  type HistoryItemDto,
  type PaperDto,
  type ResultRelease,
  type VecSettings,
  type ViolationType,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import {
  users,
  vecAttemptAnswers,
  vecAttemptEvents,
  vecAttempts,
  vecMessages,
  vecParticipants,
  vecSessionQuestions,
  vecSessions,
  vecUnlockRequests,
  type VecAttemptRow,
  type VecSessionRow,
} from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { clientIp } from '../../lib/track.js';
import { newConnectionId, oidsFor, uaHash } from '../../lib/vec-crypto.js';
import { isUniqueViolation, ms, statusOf, timesOf, toJoinDto } from './vec.common.js';
import { createAttempt, deadlineOf, finalizeAttempt, logEvent, nextAttemptNo, recordViolation, retakeContext, settleSession } from './vec.engine.js';

type Loaded = { attempt: VecAttemptRow; session: VecSessionRow };

/** The candidate's own attempt, with the session brought up to date with the clock. */
export async function loadMine(attemptId: string, userId: string): Promise<Loaded> {
  const [a] = await db.select().from(vecAttempts).where(eq(vecAttempts.id, attemptId)).limit(1);
  if (!a || a.userId !== userId) throw ApiError.notFound('Không tìm thấy bài thi.');
  const [s] = await db.select().from(vecSessions).where(eq(vecSessions.id, a.sessionId)).limit(1);
  if (!s) throw ApiError.notFound('Phòng thi không còn tồn tại.');
  const session = await settleSession(s);
  const [fresh] = await db.select().from(vecAttempts).where(eq(vecAttempts.id, attemptId)).limit(1);
  return { attempt: fresh ?? a, session };
}

async function maxAttemptsOf(s: VecSessionRow) {
  return (s.settings as VecSettings).retake.max + 1;
}

export async function attemptState(attemptId: string, userId: string): Promise<AttemptStateDto> {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  const [p] = await db.select().from(vecParticipants).where(and(eq(vecParticipants.sessionId, s.id), eq(vecParticipants.userId, userId))).limit(1);
  const info = p?.candidateInfo ?? {};
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(vecSessionQuestions).where(eq(vecSessionQuestions.sessionId, s.id));
  return {
    id: a.id,
    sessionId: s.id,
    attemptNo: a.attemptNo,
    maxAttempts: await maxAttemptsOf(s),
    state: a.state as AttemptStateDto['state'],
    paperCode: a.paperCode,
    startedAt: ms(a.startedAt),
    submittedAt: ms(a.submittedAt),
    deadlineAt: deadlineOf(a, s),
    lockReason: a.lockReason,
    lockedAt: ms(a.lockedAt),
    answered: a.answeredCount,
    total: total?.n ?? s.questionCount,
    candidate: { fullName: info.fullName ?? '', studentCode: info.studentCode ?? '', email: info.email ?? '', className: info.className ?? '', term: info.term ?? '' },
    session: await toJoinDto(s),
    serverNow: Date.now(),
    connectionId: a.connectionId,
  };
}

/** LOBBY → IN_PROGRESS when the room is live. Starting twice is harmless. */
export async function startAttempt(req: Request, attemptId: string, userId: string) {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  if (a.state === 'IN_PROGRESS') return attemptState(attemptId, userId);
  if (a.state !== 'LOBBY') throw ApiError.conflict('Bài thi này không thể bắt đầu nữa.');
  const now = Date.now();
  const status = statusOf(s, now);
  if (status === 'SCHEDULED' || status === 'LOBBY') throw ApiError.conflict('Chưa đến giờ thi. Hãy chờ trong phòng chờ.');
  if (status === 'PAUSED') throw ApiError.conflict('Giảng viên đang tạm dừng phòng thi.');
  if (status !== 'LIVE') throw ApiError.conflict('Phòng thi đã đóng.');
  const t = timesOf(s);
  if (a.attemptNo === 1 && now > t.startsAt + s.lateJoinMin * 60_000 + s.pausedTotalSec * 1000) {
    throw ApiError.conflict('Đã quá thời gian cho phép vào làm bài muộn.');
  }
  const deadline = initialDeadline(t, s.durationMin, a.attemptNo, now, false, now);
  if (deadline <= now + 5_000) throw ApiError.conflict('Thời gian của lượt này đã hết.');
  const connectionId = newConnectionId();
  const [u] = await db
    .update(vecAttempts)
    .set({
      state: 'IN_PROGRESS',
      startedAt: new Date(now),
      deadlineAt: new Date(deadline),
      pausedBaseSec: s.pausedTotalSec,
      connectionId,
      connectionAt: new Date(now),
      lastSeenAt: new Date(now),
      ipAtStart: clientIp(req),
      lastIp: clientIp(req),
      uaHash: uaHash(req.get('user-agent')),
    })
    .where(and(eq(vecAttempts.id, a.id), eq(vecAttempts.state, 'LOBBY')))
    .returning({ id: vecAttempts.id });
  if (!u) return attemptState(attemptId, userId);
  await logEvent(a, 'STARTED', 'INFO', { attemptNo: a.attemptNo });
  return attemptState(attemptId, userId);
}

/** One exam connection per attempt. A reload keeps its id; a second tab or device is refused. */
export async function claimConnection(req: Request, attemptId: string, userId: string, existing?: string) {
  const { attempt: a } = await loadMine(attemptId, userId);
  if (a.state !== 'IN_PROGRESS' && a.state !== 'SUSPENDED') throw ApiError.conflict('Bài thi không ở trạng thái làm bài.');
  const fresh = a.connectionAt && Date.now() - a.connectionAt.getTime() < DISCONNECT_AFTER_MS;
  const same = existing && existing === a.connectionId;
  if (a.connectionId && fresh && !same) {
    await logEvent(a, 'SECOND_CONNECTION', 'INFO', { ip: clientIp(req) });
    throw new ApiError(409, 'SECOND_CONNECTION', 'Bài thi này đang mở ở một tab hoặc thiết bị khác. Hãy đóng nơi đó trước.');
  }
  const connectionId = same ? a.connectionId! : newConnectionId();
  await db.update(vecAttempts).set({ connectionId, connectionAt: new Date(), lastSeenAt: new Date(), lastIp: clientIp(req) }).where(eq(vecAttempts.id, a.id));
  return { connectionId };
}

export async function getPaper(attemptId: string, userId: string): Promise<PaperDto> {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  if (a.state === 'SUSPENDED') throw new ApiError(423, 'LOCKED', 'Bài thi đang bị khóa, chờ giảng viên mở lại.');
  if (a.state !== 'IN_PROGRESS') throw ApiError.conflict('Bài thi này không ở trạng thái làm bài.');
  const settings = s.settings as VecSettings;
  const qs = await db.select().from(vecSessionQuestions).where(eq(vecSessionQuestions.sessionId, s.id)).orderBy(asc(vecSessionQuestions.position));
  const paper = buildPaper(
    qs.map((q) => ({ qid: q.qid, chapter: q.chapter, kind: q.kind as 'SINGLE' | 'MULTI', text: q.text, options: q.options, answers: q.answers, canShuffle: q.canShuffle })),
    a.seed,
    settings.paper.shuffleQuestions,
    settings.paper.shuffleOptions,
  );
  const byId = new Map(qs.map((q) => [q.qid, q]));
  const given = await db.select().from(vecAttemptAnswers).where(eq(vecAttemptAnswers.attemptId, a.id));
  const givenBy = new Map(given.map((g) => [g.qid, g]));
  const answers: PaperDto['answers'] = {};
  const questions = paper.map((pq) => {
    const q = byId.get(pq.qid)!;
    const oids = oidsFor(a.seed, q.qid, q.options.length);
    const g = givenBy.get(q.qid);
    if (g) answers[q.qid] = { oids: g.selected.map((i) => oids[i]!).filter(Boolean), flagged: g.flagged, seq: g.seq };
    return { qid: q.qid, kind: pq.kind, text: q.text, options: pq.options.map((o) => ({ oid: oids[o.idx]!, text: q.options[o.idx]! })) };
  });
  return { attemptId: a.id, paperCode: a.paperCode, questions, answers };
}

async function applyAnswers(a: VecAttemptRow, s: VecSessionRow, items: AnswerItem[], now: number) {
  const qs = await db.select({ qid: vecSessionQuestions.qid, kind: vecSessionQuestions.kind, options: vecSessionQuestions.options }).from(vecSessionQuestions).where(eq(vecSessionQuestions.sessionId, s.id));
  const byId = new Map(qs.map((q) => [q.qid, q]));
  const dl = deadlineOf(a, s, now);
  const late = dl != null && now > dl;
  let saved = 0;
  for (const it of items) {
    const q = byId.get(it.qid);
    if (!q) continue;
    const oids = oidsFor(a.seed, q.qid, q.options.length);
    const idx = it.oids.map((o) => oids.indexOf(o));
    if (idx.some((i) => i < 0) || new Set(idx).size !== idx.length) continue;
    if (q.kind === 'SINGLE' && idx.length > 1) continue;
    const selected = idx.sort((x, y) => x - y);
    await db
      .insert(vecAttemptAnswers)
      .values({ attemptId: a.id, qid: q.qid, selected, flagged: it.flagged, seq: it.seq, answeredAt: new Date(now), lateSync: late })
      .onConflictDoUpdate({
        target: [vecAttemptAnswers.attemptId, vecAttemptAnswers.qid],
        set: { selected: sql`excluded.selected`, flagged: sql`excluded.flagged`, seq: sql`excluded.seq`, answeredAt: sql`excluded.answered_at`, lateSync: sql`excluded.late_sync` },
        setWhere: sql`${vecAttemptAnswers.seq} < excluded.seq`,
      });
    saved++;
  }
  const [c] = await db
    .select({
      answered: sql<number>`count(*) filter (where jsonb_array_length(${vecAttemptAnswers.selected}) > 0)::int`,
      flagged: sql<number>`count(*) filter (where ${vecAttemptAnswers.flagged})::int`,
    })
    .from(vecAttemptAnswers)
    .where(eq(vecAttemptAnswers.attemptId, a.id));
  await db.update(vecAttempts).set({ answeredCount: c?.answered ?? 0, flaggedCount: c?.flagged ?? 0 }).where(eq(vecAttempts.id, a.id));
  return saved;
}

function assertWritable(a: VecAttemptRow, s: VecSessionRow, now: number) {
  if (a.state === 'SUSPENDED') throw new ApiError(423, 'LOCKED', 'Bài thi đang bị khóa.');
  if (a.state !== 'IN_PROGRESS') throw new ApiError(409, 'NOT_ACTIVE', 'Bài thi đã kết thúc.');
  const dl = deadlineOf(a, s, now);
  if (dl != null && now > dl + LATE_SYNC_GRACE_MS) throw new ApiError(409, 'TIME_UP', 'Đã hết giờ làm bài.');
}

export async function saveAnswers(attemptId: string, userId: string, items: AnswerItem[]) {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  const now = Date.now();
  assertWritable(a, s, now);
  const saved = await applyAnswers(a, s, items, now);
  return { saved, serverNow: now };
}

export async function submitAttempt(attemptId: string, userId: string, items?: AnswerItem[]) {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  const now = Date.now();
  if (isFinishedAttempt(a.state)) return { state: a.state, serverNow: now };
  assertWritable(a, s, now);
  if (items?.length) await applyAnswers(a, s, items, now);
  const dl = deadlineOf(a, s, now);
  const auto = dl != null && now >= dl - 1500;
  const done = await finalizeAttempt(a, auto ? 'AUTO_SUBMITTED' : 'SUBMITTED', auto ? 'TIME' : 'MANUAL', now);
  return { state: (done?.state ?? a.state) as string, serverNow: now };
}

export async function heartbeat(req: Request, attemptId: string, userId: string, body: { fullscreen: boolean; visible: boolean; focused: boolean; current: number; connectionId?: string; ackMessage?: number }): Promise<HeartbeatResponse> {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  const now = Date.now();
  const ip = clientIp(req);
  const commands: HeartbeatCommand[] = [];
  const status = statusOf(s, now);

  if (isActiveAttempt(a.state)) {
    if (a.connectionId && body.connectionId && body.connectionId !== a.connectionId) {
      commands.push({ type: 'RELEASE_DEVICE' });
    } else {
      await db
        .update(vecAttempts)
        .set({ lastSeenAt: new Date(now), connectionAt: new Date(now), fullscreen: body.fullscreen, visible: body.visible, focused: body.focused, currentIndex: body.current, lastIp: ip })
        .where(eq(vecAttempts.id, a.id));
      if (a.state === 'IN_PROGRESS' && a.lastIp && ip && a.lastIp !== ip) {
        await recordViolation(a, s.settings as VecSettings, 'IP_CHANGE', { from: a.lastIp, to: ip }, now);
      }
    }
  }

  if (a.state === 'SUSPENDED') commands.push({ type: 'LOCK', reason: a.lockReason ?? 'Bị khóa' });
  if (a.state === 'FORCE_SUBMITTED') commands.push({ type: 'FORCE_SUBMIT' });
  if (a.state === 'VOIDED') commands.push({ type: 'REMOVE', reason: a.submitReason ?? '' });
  if (status === 'PAUSED') commands.push({ type: 'SESSION_PAUSED' });
  if (status === 'ENDED') commands.push({ type: 'SESSION_ENDED' });

  const msgs = await db
    .select()
    .from(vecMessages)
    .where(and(eq(vecMessages.sessionId, s.id), gt(vecMessages.id, body.ackMessage ?? 0), or(sql`${vecMessages.attemptId} is null`, eq(vecMessages.attemptId, a.id))))
    .orderBy(asc(vecMessages.id))
    .limit(5);
  for (const m of msgs) commands.push({ type: 'MESSAGE', id: m.id, urgent: m.kind === 'URGENT', body: m.body, at: m.createdAt.getTime() });

  const [fresh] = await db.select({ state: vecAttempts.state, lockReason: vecAttempts.lockReason }).from(vecAttempts).where(eq(vecAttempts.id, a.id)).limit(1);
  return {
    serverNow: now,
    attemptState: (fresh?.state ?? a.state) as HeartbeatResponse['attemptState'],
    sessionStatus: status,
    deadlineAt: deadlineOf(a, s, now),
    lockReason: fresh?.lockReason ?? a.lockReason,
    commands,
  };
}

export async function reportViolation(attemptId: string, userId: string, type: ViolationType, data?: Record<string, unknown>) {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  if (a.state !== 'IN_PROGRESS') return { severity: 'INFO' as const, state: a.state, lockReason: a.lockReason };
  const r = await recordViolation(a, s.settings as VecSettings, type, data);
  const [fresh] = await db.select({ state: vecAttempts.state, lockReason: vecAttempts.lockReason }).from(vecAttempts).where(eq(vecAttempts.id, a.id)).limit(1);
  return { severity: r.severity, state: fresh?.state ?? a.state, lockReason: fresh?.lockReason ?? null };
}

/* ───────────────────────────── results ───────────────────────────── */

function released(mode: ResultRelease, s: VecSessionRow, a: VecAttemptRow, now: number) {
  if (!isFinishedAttempt(a.state)) return false;
  if (mode === 'NEVER') return false;
  if (mode === 'AFTER_SUBMIT') return true;
  if (mode === 'AFTER_END') return statusOf(s, now) === 'ENDED';
  return s.resultsReleasedAt != null;
}

export async function attemptResult(attemptId: string, userId: string): Promise<AttemptResultDto> {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  const settings = s.settings as VecSettings;
  const now = Date.now();
  const all = await db.select().from(vecAttempts).where(and(eq(vecAttempts.sessionId, s.id), eq(vecAttempts.userId, userId))).orderBy(asc(vecAttempts.attemptNo));
  const canScore = released(settings.results.score, s, a, now);
  const canRW = released(settings.results.rightWrong, s, a, now);
  const canAns = released(settings.results.correctAnswers, s, a, now);
  const counted = countedScore(all.map((x) => ({ attemptNo: x.attemptNo, score10: x.score10, submittedAt: ms(x.submittedAt) })), settings.retake.scoring);
  const ctx = await retakeContext(s, userId, now);
  const gate = canStartRetake(ctx);
  const [p] = await db.select().from(vecParticipants).where(and(eq(vecParticipants.sessionId, s.id), eq(vecParticipants.userId, userId))).limit(1);

  const dto: AttemptResultDto = {
    attemptId: a.id,
    sessionId: s.id,
    title: s.title,
    attemptNo: a.attemptNo,
    maxAttempts: settings.retake.max + 1,
    state: a.state as AttemptResultDto['state'],
    submittedAt: ms(a.submittedAt),
    paperCode: a.paperCode,
    score:
      canScore && a.score10 != null
        ? {
            score10: a.score10,
            label: gradeLabel(a.score10),
            passed: a.score10 >= settings.scoring.passMark,
            correct: a.correctCount ?? 0,
            wrong: a.wrongCount ?? 0,
            blank: a.blankCount ?? 0,
            total: (a.correctCount ?? 0) + (a.wrongCount ?? 0) + (a.blankCount ?? 0),
            durationSec: a.startedAt && a.submittedAt ? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000) : null,
          }
        : null,
    counted: canScore && counted ? { score10: counted.score, attemptNo: counted.attemptNo, how: settings.retake.scoring } : null,
    attempts: all.map((x) => ({ id: x.id, attemptNo: x.attemptNo, state: x.state as AttemptResultDto['state'], score10: released(settings.results.score, s, x, now) ? x.score10 : null, submittedAt: ms(x.submittedAt) })),
    canSeeScore: canScore,
    canSeeRightWrong: canRW,
    canSeeAnswers: canAns,
    retake: {
      ok: gate.ok,
      reason: gate.ok ? undefined : gate.reason,
      used: ctx.retakesUsed,
      quota: retakeQuota(ctx),
      mode: settings.retake.mode,
      requested: Boolean(p?.retakeRequestedAt) && !p?.retakeApprovedAt,
      approved: Boolean(p?.retakeApprovedAt),
    },
    sessionStatus: statusOf(s, now),
  };

  if (canRW || canAns) {
    const qs = await db.select().from(vecSessionQuestions).where(eq(vecSessionQuestions.sessionId, s.id)).orderBy(asc(vecSessionQuestions.position));
    const paper = buildPaper(
      qs.map((q) => ({ qid: q.qid, chapter: q.chapter, kind: q.kind as 'SINGLE' | 'MULTI', text: q.text, options: q.options, answers: q.answers, canShuffle: q.canShuffle })),
      a.seed,
      settings.paper.shuffleQuestions,
      settings.paper.shuffleOptions,
    );
    const given = await db.select().from(vecAttemptAnswers).where(eq(vecAttemptAnswers.attemptId, a.id));
    const givenBy = new Map(given.map((g) => [g.qid, g.selected]));
    const byId = new Map(qs.map((q) => [q.qid, q]));
    dto.review = paper.map((pq) => {
      const q = byId.get(pq.qid)!;
      const oids = oidsFor(a.seed, q.qid, q.options.length);
      const pick = givenBy.get(q.qid) ?? [];
      const right = pick.length === q.answers.length && pick.every((i) => q.answers.includes(i));
      return {
        qid: q.qid,
        kind: pq.kind,
        text: q.text,
        options: pq.options.map((o) => ({ oid: oids[o.idx]!, text: q.options[o.idx]!, chosen: pick.includes(o.idx), ...(canAns ? { correct: q.answers.includes(o.idx) } : {}) })),
        ...(canRW ? { verdict: (!pick.length ? 'BLANK' : right ? 'RIGHT' : 'WRONG') as 'RIGHT' | 'WRONG' | 'BLANK' } : {}),
      };
    });
  }
  return dto;
}

/* ───────────────────────────── retakes & requests ───────────────────────────── */

export async function startRetake(attemptId: string, userId: string) {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  const ctx = await retakeContext(s, userId);
  const gate = canStartRetake(ctx);
  if (!gate.ok) throw ApiError.conflict(gate.reason === 'NEEDS_APPROVAL' ? 'Cần giảng viên duyệt trước khi làm lại.' : `Chưa thể làm lại (${gate.reason}).`);
  try {
    const no = await nextAttemptNo(s.id, userId);
    const next = await createAttempt(s.id, userId, no, true);
    await db
      .update(vecParticipants)
      .set({ retakesUsed: sql`${vecParticipants.retakesUsed} + 1`, retakeApprovedAt: null, retakeRequestedAt: null, retakeRequestNote: null })
      .where(and(eq(vecParticipants.sessionId, s.id), eq(vecParticipants.userId, userId)));
    return { attemptId: next.id };
  } catch (e) {
    if (isUniqueViolation(e)) throw ApiError.conflict('Bạn đang có một lượt thi chưa hoàn tất.');
    throw e;
  } finally {
    void a;
  }
}

export async function requestUnlock(attemptId: string, userId: string, kind: 'UNLOCK' | 'RETAKE', reason: string) {
  const { attempt: a, session: s } = await loadMine(attemptId, userId);
  if (kind === 'UNLOCK' && a.state !== 'SUSPENDED') throw ApiError.conflict('Bài thi không bị khóa.');
  if (kind === 'RETAKE') {
    if (!isFinishedAttempt(a.state)) throw ApiError.conflict('Hãy nộp bài trước khi xin làm lại.');
    const gate = canStartRetake({ ...(await retakeContext(s, userId)), approved: true });
    if (!gate.ok) throw ApiError.conflict('Hiện chưa thể xin làm lại.');
    await db
      .update(vecParticipants)
      .set({ retakeRequestedAt: new Date(), retakeRequestNote: reason || null })
      .where(and(eq(vecParticipants.sessionId, s.id), eq(vecParticipants.userId, userId)));
  }
  const [dup] = await db.select({ id: vecUnlockRequests.id }).from(vecUnlockRequests).where(and(eq(vecUnlockRequests.attemptId, a.id), eq(vecUnlockRequests.kind, kind), eq(vecUnlockRequests.status, 'PENDING'))).limit(1);
  if (dup) return { id: dup.id, duplicate: true };
  const [r] = await db.insert(vecUnlockRequests).values({ attemptId: a.id, sessionId: s.id, kind, reason }).returning({ id: vecUnlockRequests.id });
  await logEvent(a, kind === 'UNLOCK' ? 'UNLOCK_REQUEST' : 'RETAKE_REQUEST', 'INFO', { reason });
  return { id: r!.id, duplicate: false };
}

/* ───────────────────────────── history ───────────────────────────── */

export async function takenHistory(userId: string): Promise<HistoryItemDto[]> {
  const rows = await db
    .select({ a: vecAttempts, s: vecSessions })
    .from(vecAttempts)
    .innerJoin(vecSessions, eq(vecSessions.id, vecAttempts.sessionId))
    .where(eq(vecAttempts.userId, userId))
    .orderBy(desc(vecSessions.startsAt))
    .limit(300);
  const bySession = new Map<string, { s: VecSessionRow; list: VecAttemptRow[] }>();
  for (const r of rows) {
    const g = bySession.get(r.s.id) ?? { s: r.s, list: [] };
    g.list.push(r.a);
    bySession.set(r.s.id, g);
  }
  const now = Date.now();
  const out: HistoryItemDto[] = [];
  for (const { s, list } of bySession.values()) {
    const settings = s.settings as VecSettings;
    list.sort((x, y) => x.attemptNo - y.attemptNo);
    const visible = list.some((a) => released(settings.results.score, s, a, now));
    const counted = visible ? countedScore(list.map((x) => ({ attemptNo: x.attemptNo, score10: x.score10, submittedAt: ms(x.submittedAt) })), settings.retake.scoring) : null;
    out.push({
      id: s.id,
      sessionId: s.id,
      kind: s.kind as 'FE' | 'PE',
      title: s.title,
      subjectCode: s.subjectCode,
      startsAt: s.startsAt.getTime(),
      status: statusOf(s, now),
      attemptId: list[list.length - 1]!.id,
      attempts: list.map((x) => ({ id: x.id, attemptNo: x.attemptNo, state: x.state as 'LOBBY', score10: released(settings.results.score, s, x, now) ? x.score10 : null })),
      countedScore: counted?.score ?? null,
      scoreVisible: visible,
      expiresAt: ms(s.expiresAt),
    });
  }
  return out;
}

export { users, vecAttemptEvents, inArray };
