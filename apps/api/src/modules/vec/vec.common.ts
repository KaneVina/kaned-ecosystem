import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  effectiveSessionStatus,
  isActiveAttempt,
  type JoinSessionDto,
  type SessionStatus,
  type SessionTimes,
  type VecSessionDto,
  type VecSettings,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { universities, users, vecAttempts, vecSessions, type VecSessionRow } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { decryptOtp } from '../../lib/vec-crypto.js';

export const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

export const timesOf = (s: VecSessionRow): SessionTimes => ({
  startsAt: s.startsAt.getTime(),
  endsAt: s.endsAt.getTime(),
  lobbyOpenMin: s.lobbyOpenMin,
  lateJoinMin: s.lateJoinMin,
  pausedAt: ms(s.pausedAt),
  pausedTotalSec: s.pausedTotalSec,
  statusOverride: (s.statusOverride as SessionTimes['statusOverride']) ?? null,
});

export const statusOf = (s: VecSessionRow, now = Date.now()): SessionStatus => effectiveSessionStatus(now, timesOf(s));

export async function loadSession(id: string): Promise<VecSessionRow> {
  const [row] = await db.select().from(vecSessions).where(eq(vecSessions.id, id)).limit(1);
  if (!row || row.statusOverride === 'DELETING') throw ApiError.notFound('Không tìm thấy phiên thi.');
  return row;
}

/** The host, or an admin, may run a session. */
export async function loadHostedSession(id: string, userId: string, role: string): Promise<VecSessionRow> {
  const s = await loadSession(id);
  if (s.hostId !== userId && role !== 'ADMIN') throw ApiError.forbidden('Chỉ giảng viên tạo phiên này mới thao tác được.');
  return s;
}

export async function countsFor(sessionIds: string[]) {
  const map = new Map<string, VecSessionDto['counts']>();
  for (const id of sessionIds) map.set(id, { joined: 0, inProgress: 0, suspended: 0, submitted: 0, pendingRequests: 0 });
  if (!sessionIds.length) return map;
  const rows = await db
    .select({ sessionId: vecAttempts.sessionId, state: vecAttempts.state, n: sql<number>`count(distinct ${vecAttempts.userId})::int` })
    .from(vecAttempts)
    .where(inArray(vecAttempts.sessionId, sessionIds))
    .groupBy(vecAttempts.sessionId, vecAttempts.state);
  const joined = await db.execute<{ session_id: string; n: number }>(
    sql`select session_id, count(*)::int as n from vec_participants where session_id in (${sql.join(sessionIds.map((i) => sql`${i}`), sql`, `)}) group by session_id`,
  );
  for (const r of joined) map.get(r.session_id)!.joined = Number(r.n);
  for (const r of rows) {
    const c = map.get(r.sessionId)!;
    if (r.state === 'IN_PROGRESS') c.inProgress += r.n;
    else if (r.state === 'SUSPENDED') c.suspended += r.n;
    else if (r.state === 'SUBMITTED' || r.state === 'AUTO_SUBMITTED' || r.state === 'FORCE_SUBMITTED') c.submitted += r.n;
  }
  const pend = await db.execute<{ session_id: string; n: number }>(
    sql`select session_id, count(*)::int as n from vec_unlock_requests where status = 'PENDING' and session_id in (${sql.join(sessionIds.map((i) => sql`${i}`), sql`, `)}) group by session_id`,
  );
  for (const r of pend) map.get(r.session_id)!.pendingRequests = Number(r.n);
  return map;
}

async function colorFor(universityId: string | null) {
  if (!universityId) return null;
  const [u] = await db.select({ color: universities.color }).from(universities).where(eq(universities.id, universityId)).limit(1);
  return u?.color ?? null;
}

export async function toSessionDto(s: VecSessionRow, opts: { host: boolean; counts?: VecSessionDto['counts']; hostName?: string } = { host: true }): Promise<VecSessionDto> {
  const counts = opts.counts ?? (await countsFor([s.id])).get(s.id)!;
  const settings = s.settings as VecSettings;
  return {
    id: s.id,
    kind: s.kind as VecSessionDto['kind'],
    title: s.title,
    description: s.description,
    instructions: s.instructions,
    lecturerDisplay: s.lecturerDisplay,
    subjectCode: s.subjectCode,
    subjectName: s.subjectName,
    universityColor: await colorFor(s.universityId),
    roomCode: s.roomCode,
    otp: opts.host ? decryptOtp(s.otpEnc) : null,
    otpRequired: Boolean(s.otpEnc),
    startsAt: s.startsAt.getTime(),
    endsAt: s.endsAt.getTime(),
    durationMin: s.durationMin,
    questionCount: s.questionCount,
    status: statusOf(s),
    lobbyOpenMin: s.lobbyOpenMin,
    lateJoinMin: s.lateJoinMin,
    pausedAt: ms(s.pausedAt),
    pausedTotalSec: s.pausedTotalSec,
    settings,
    ephemeralSource: s.ephemeral,
    counts,
    createdAt: s.createdAt.getTime(),
    hostName: opts.hostName,
  };
}

export async function toJoinDto(s: VecSessionRow): Promise<JoinSessionDto> {
  const settings = s.settings as VecSettings;
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    instructions: s.instructions,
    kind: s.kind as JoinSessionDto['kind'],
    subjectCode: s.subjectCode,
    subjectName: s.subjectName,
    universityColor: await colorFor(s.universityId),
    lecturerDisplay: s.lecturerDisplay,
    startsAt: s.startsAt.getTime(),
    endsAt: s.endsAt.getTime(),
    durationMin: s.durationMin,
    questionCount: s.questionCount,
    lobbyOpenMin: s.lobbyOpenMin,
    lateJoinMin: s.lateJoinMin,
    status: statusOf(s),
    roomCode: s.roomCode,
    settings: { integrity: settings.integrity, results: settings.results, retake: settings.retake, access: settings.access },
  };
}

export async function audit(sessionId: string | null, actorId: string | null, action: string, target?: string | null, data?: Record<string, unknown>) {
  const { vecAudit } = await import('../../db/schema.js');
  await db
    .insert(vecAudit)
    .values({ sessionId, actorId, action, target: target ?? null, data: data ?? null })
    .catch((e) => console.error('[vec] audit failed', e));
}

export const hostNameOf = async (hostId: string) => {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, hostId)).limit(1);
  return u?.name;
};

export const isUniqueViolation = (e: unknown, constraint?: string) => {
  const err = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const code = err?.code ?? err?.cause?.code;
  const name = err?.constraint_name ?? err?.cause?.constraint_name;
  return code === '23505' && (!constraint || name === constraint);
};

export { isActiveAttempt, and, eq };
