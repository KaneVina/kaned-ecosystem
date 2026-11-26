import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  ACTIVE_ATTEMPT_STATES,
  PE_RETENTION_MS,
  LATE_SYNC_GRACE_MS,
  MERGE_WINDOW_MS,
  VIOLATION_LABEL,
  attemptDeadline,
  countedScore,
  decideAction,
  gradeAttempt,
  gradeLabel,
  paperCodeFrom,
  type AttemptState,
  type RetakeContext,
  type Severity,
  type ViolationType,
  type VecSettings,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import {
  vecAttemptAnswers,
  vecAttemptEvents,
  vecAttempts,
  vecParticipants,
  vecSessionQuestions,
  vecSessions,
  type VecAttemptRow,
  type VecSessionRow,
} from '../../db/schema.js';
import { newSeed } from '../../lib/vec-crypto.js';
import { isUniqueViolation, ms, statusOf, timesOf } from './vec.common.js';

const ACTIVE = ACTIVE_ATTEMPT_STATES as unknown as string[];

/** What the candidate's clock counts down to right now. */
export function deadlineOf(a: VecAttemptRow, s: VecSessionRow, now = Date.now()): number | null {
  if (!a.deadlineAt) return null;
  return attemptDeadline({ deadlineAt: a.deadlineAt.getTime(), pausedBaseSec: a.pausedBaseSec, timeBonusSec: a.timeBonusSec }, timesOf(s), now);
}

export async function recomputeCounted(sessionId: string, userId: string) {
  const [s] = await db.select({ settings: vecSessions.settings }).from(vecSessions).where(eq(vecSessions.id, sessionId)).limit(1);
  if (!s) return;
  const rows = await db
    .select({ attemptNo: vecAttempts.attemptNo, score10: vecAttempts.score10, submittedAt: vecAttempts.submittedAt })
    .from(vecAttempts)
    .where(and(eq(vecAttempts.sessionId, sessionId), eq(vecAttempts.userId, userId)));
  const counted = countedScore(
    rows.map((r) => ({ attemptNo: r.attemptNo, score10: r.score10, submittedAt: r.submittedAt ? r.submittedAt.getTime() : null })),
    (s.settings as VecSettings).retake.scoring,
  );
  await db
    .update(vecParticipants)
    .set({ countedScore10: counted?.score ?? null, countedAttemptNo: counted?.attemptNo ?? null })
    .where(and(eq(vecParticipants.sessionId, sessionId), eq(vecParticipants.userId, userId)));
}

export type FinalState = 'SUBMITTED' | 'AUTO_SUBMITTED' | 'FORCE_SUBMITTED';

/**
 * Grades an attempt on the server and closes it. The UPDATE only matches an
 * attempt that is still open, so submitting twice (a click and the timer, or
 * the timer and the finalizer) grades once.
 */
export async function finalizeAttempt(attempt: VecAttemptRow, final: FinalState, reason: string, now = Date.now()): Promise<VecAttemptRow | null> {
  const [s] = await db.select().from(vecSessions).where(eq(vecSessions.id, attempt.sessionId)).limit(1);
  if (!s) return null;
  if (s.kind === 'PE') {
    // Practical rooms are graded by hand: only the state and the time are recorded here.
    const [done] = await db
      .update(vecAttempts)
      .set({ state: final, submittedAt: new Date(now), submitReason: reason, version: sql`${vecAttempts.version} + 1` })
      .where(and(eq(vecAttempts.id, attempt.id), inArray(vecAttempts.state, ACTIVE)))
      .returning();
    return done ?? null;
  }
  const settings = s.settings as VecSettings;
  const questions = await db
    .select({ qid: vecSessionQuestions.qid, answers: vecSessionQuestions.answers })
    .from(vecSessionQuestions)
    .where(eq(vecSessionQuestions.sessionId, attempt.sessionId));
  const given = await db.select().from(vecAttemptAnswers).where(eq(vecAttemptAnswers.attemptId, attempt.id));
  const chosen: Record<string, number[]> = {};
  for (const g of given) chosen[g.qid] = g.selected;
  const g = gradeAttempt(questions, chosen, settings.scoring.multiAnswer);
  const [updated] = await db
    .update(vecAttempts)
    .set({
      state: final,
      submittedAt: new Date(now),
      submitReason: reason,
      correctCount: g.correct,
      wrongCount: g.wrong,
      blankCount: g.blank,
      score10: g.score10,
      gradeLabel: gradeLabel(g.score10),
      passed: g.score10 >= settings.scoring.passMark,
      gradedAt: new Date(now),
      answeredCount: g.correct + g.wrong,
      version: sql`${vecAttempts.version} + 1`,
    })
    .where(and(eq(vecAttempts.id, attempt.id), inArray(vecAttempts.state, ACTIVE)))
    .returning();
  if (updated) await recomputeCounted(attempt.sessionId, attempt.userId);
  return updated ?? null;
}

export async function voidAttempt(attempt: VecAttemptRow, reason: string, now = Date.now()) {
  const [u] = await db
    .update(vecAttempts)
    .set({ state: 'VOIDED', submittedAt: new Date(now), submitReason: reason, version: sql`${vecAttempts.version} + 1` })
    .where(and(eq(vecAttempts.id, attempt.id), inArray(vecAttempts.state, ACTIVE)))
    .returning();
  if (u) await recomputeCounted(attempt.sessionId, attempt.userId);
  return u ?? null;
}

/** New attempt in the lobby state; the unique indexes settle any race. */
export async function createAttempt(sessionId: string, userId: string, attemptNo: number, countsTowardLimit = true) {
  const seed = newSeed();
  const [row] = await db
    .insert(vecAttempts)
    .values({ sessionId, userId, attemptNo, countsTowardLimit, state: 'LOBBY', seed, paperCode: paperCodeFrom(seed) })
    .returning();
  return row!;
}

export async function nextAttemptNo(sessionId: string, userId: string) {
  const [r] = await db
    .select({ n: sql<number>`coalesce(max(${vecAttempts.attemptNo}), 0)::int` })
    .from(vecAttempts)
    .where(and(eq(vecAttempts.sessionId, sessionId), eq(vecAttempts.userId, userId)));
  return (r?.n ?? 0) + 1;
}

/**
 * Logs one behaviour, merges ones that fire together, applies the preset and
 * locks the attempt when the rule says so. Counters move in the same statement.
 */
export async function recordViolation(
  attempt: VecAttemptRow,
  settings: VecSettings,
  type: ViolationType,
  data: Record<string, unknown> | undefined,
  now = Date.now(),
): Promise<{ severity: Severity; locked: boolean; lockReason: string | null; merged: boolean }> {
  const prior = await db
    .select({ type: vecAttemptEvents.type, n: sql<number>`count(*)::int` })
    .from(vecAttemptEvents)
    .where(and(eq(vecAttemptEvents.attemptId, attempt.id), inArray(vecAttemptEvents.severity, ['WARN', 'LOCK'])))
    .groupBy(vecAttemptEvents.type);
  const counts: Partial<Record<ViolationType, number>> = {};
  for (const p of prior) counts[p.type as ViolationType] = p.n;

  let severity = decideAction(type, settings.integrity.preset, counts, data);

  // Events inside the merge window collapse into the strictest one.
  const [recent] = await db
    .select()
    .from(vecAttemptEvents)
    .where(and(eq(vecAttemptEvents.attemptId, attempt.id), inArray(vecAttemptEvents.severity, ['WARN', 'LOCK']), gt(vecAttemptEvents.createdAt, new Date(now - MERGE_WINDOW_MS))))
    .orderBy(desc(vecAttemptEvents.id))
    .limit(1);
  const rank = { INFO: 0, WARN: 1, LOCK: 2 } as const;
  let merged = false;
  let undoWarn = 0;
  if (recent && severity !== 'INFO') {
    if (rank[severity] <= rank[recent.severity as Severity]) {
      merged = true;
    } else if (recent.severity === 'WARN') {
      undoWarn = 1; // escalating a warning that just fired into a lock
    }
  }
  const stored: Severity = merged ? 'INFO' : severity;
  await db.insert(vecAttemptEvents).values({
    attemptId: attempt.id,
    sessionId: attempt.sessionId,
    type,
    severity: stored,
    data: { ...(data ?? {}), ...(merged ? { merged: true } : {}) },
  });

  if (merged) return { severity: recent!.severity as Severity, locked: false, lockReason: null, merged: true };

  const label = VIOLATION_LABEL[type];
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (severity === 'LOCK') {
    set.violationLock = sql`${vecAttempts.violationLock} + 1`;
    set.riskScore = sql`${vecAttempts.riskScore} + 10 - ${undoWarn * 3}`;
    if (undoWarn) set.violationWarn = sql`greatest(${vecAttempts.violationWarn} - 1, 0)`;
    set.state = 'SUSPENDED';
    set.lockReason = label;
    set.lockedAt = new Date(now);
  } else if (severity === 'WARN') {
    set.violationWarn = sql`${vecAttempts.violationWarn} + 1`;
    set.riskScore = sql`${vecAttempts.riskScore} + 3`;
  } else {
    set.violationLog = sql`${vecAttempts.violationLog} + 1`;
    if (type === 'COPY_ATTEMPT' || type === 'DEVTOOLS_SUSPECT') set.riskScore = sql`${vecAttempts.riskScore} + 1`;
  }
  const where = severity === 'LOCK' ? and(eq(vecAttempts.id, attempt.id), eq(vecAttempts.state, 'IN_PROGRESS')) : eq(vecAttempts.id, attempt.id);
  const [u] = await db.update(vecAttempts).set(set).where(where).returning({ state: vecAttempts.state });
  return { severity, locked: severity === 'LOCK' && u?.state === 'SUSPENDED', lockReason: severity === 'LOCK' ? label : null, merged: false };
}

export async function logEvent(attempt: Pick<VecAttemptRow, 'id' | 'sessionId'>, type: string, severity: Severity, data?: Record<string, unknown>, actorId?: string) {
  await db.insert(vecAttemptEvents).values({ attemptId: attempt.id, sessionId: attempt.sessionId, type, severity, data: data ?? null, actorId: actorId ?? null });
}

/**
 * Brings a session up to date with the clock without any scheduler:
 * attempts past their deadline are graded, and a session past its end is closed.
 * Called whenever someone looks at the session, and by the optional tick.
 */
export async function settleSession(session: VecSessionRow, now = Date.now()): Promise<VecSessionRow> {
  if (session.statusOverride === 'DELETING' || session.statusOverride === 'CANCELLED') return session;
  const open = await db
    .select()
    .from(vecAttempts)
    .where(and(eq(vecAttempts.sessionId, session.id), eq(vecAttempts.state, 'IN_PROGRESS')));
  for (const a of open) {
    const dl = deadlineOf(a, session, now);
    if (dl != null && now > dl + LATE_SYNC_GRACE_MS) await finalizeAttempt(a, 'AUTO_SUBMITTED', 'TIME', dl);
  }
  const status = statusOf(session, now);
  if (status === 'ENDED' && session.statusOverride !== 'ENDED') {
    await closeSession(session, session.endsAt.getTime(), 'TIME');
    const [fresh] = await db.select().from(vecSessions).where(eq(vecSessions.id, session.id)).limit(1);
    return fresh ?? session;
  }
  return session;
}

/** Ends a session and settles every attempt still open (SRS 12.7 / 13.4). */
export async function closeSession(session: VecSessionRow, now: number, reason: 'TIME' | 'MANUAL') {
  const settings = session.settings as VecSettings;
  const live = await db.select().from(vecAttempts).where(and(eq(vecAttempts.sessionId, session.id), inArray(vecAttempts.state, ACTIVE)));
  for (const a of live) {
    if (a.state === 'IN_PROGRESS') await finalizeAttempt(a, reason === 'TIME' ? 'AUTO_SUBMITTED' : 'FORCE_SUBMITTED', reason, now);
    else if (a.state === 'SUSPENDED') {
      if (settings.integrity.onSessionEndWhileSuspended === 'VOID') await voidAttempt(a, 'SESSION_ENDED', now);
      else await finalizeAttempt(a, 'FORCE_SUBMITTED', 'SESSION_ENDED', now);
    } else await voidAttempt(a, 'NEVER_STARTED', now);
  }
  await db
    .update(vecSessions)
    .set({
      statusOverride: 'ENDED',
      endedAt: new Date(now),
      endReason: reason,
      pausedAt: null,
      updatedAt: new Date(),
      // A practical room keeps its files for a week from when it actually closed.
      ...(session.kind === 'PE' ? { expiresAt: new Date(now + PE_RETENTION_MS) } : {}),
    })
    .where(and(eq(vecSessions.id, session.id), sql`${vecSessions.statusOverride} is distinct from 'ENDED'`));
}

export async function retakeContext(session: VecSessionRow, userId: string, now = Date.now()): Promise<RetakeContext> {
  const settings = session.settings as VecSettings;
  const [p] = await db
    .select()
    .from(vecParticipants)
    .where(and(eq(vecParticipants.sessionId, session.id), eq(vecParticipants.userId, userId)))
    .limit(1);
  const atts = await db
    .select({ state: vecAttempts.state, submittedAt: vecAttempts.submittedAt })
    .from(vecAttempts)
    .where(and(eq(vecAttempts.sessionId, session.id), eq(vecAttempts.userId, userId)))
    .orderBy(asc(vecAttempts.attemptNo));
  const finished = atts.filter((a) => ['SUBMITTED', 'AUTO_SUBMITTED', 'FORCE_SUBMITTED'].includes(a.state));
  const last = finished[finished.length - 1];
  const t = timesOf(session);
  const endsAt = t.endsAt + (t.pausedTotalSec + (t.pausedAt ? Math.floor((now - t.pausedAt) / 1000) : 0)) * 1000;
  return {
    retake: settings.retake,
    durationMin: session.durationMin,
    now,
    sessionEnded: statusOf(session, now) === 'ENDED' || statusOf(session, now) === 'CANCELLED',
    sessionEndsAt: endsAt,
    hasActiveAttempt: atts.some((a) => ACTIVE.includes(a.state)),
    lastSubmittedAt: ms(last?.submittedAt),
    retakesUsed: p?.retakesUsed ?? 0,
    extraRetakes: p?.extraRetakes ?? 0,
    approved: Boolean(p?.retakeApprovedAt),
    hasFinishedAttempt: finished.length > 0,
  };
}

export { isUniqueViolation };
export type { AttemptState };
