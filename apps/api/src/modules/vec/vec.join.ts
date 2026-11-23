import type { Request } from 'express';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  ACTIVE_ATTEMPT_STATES,
  canStartRetake,
  isFinishedAttempt,
  joinClosesAt,
  lobbyOpensAt,
  roomCodeSchema,
  type CandidateInfo,
  type JoinLookup,
  type JoinPrefillDto,
  type MeStateDto,
  type VecSettings,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { academicTerms, majors, universities, users, vecAttempts, vecJoinAttempts, vecParticipants, vecSessions } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { seal, unseal } from '../../lib/seal.js';
import { clientIp } from '../../lib/track.js';
import { decryptOtp, uaHash } from '../../lib/vec-crypto.js';
import { statusOf, toJoinDto, isUniqueViolation } from './vec.common.js';
import { createAttempt, nextAttemptNo, retakeContext, settleSession } from './vec.engine.js';

const TICKET = 'vec-join';
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 10 * 60_000;

async function assertNotLockedOut(userId: string, ip: string | null) {
  const since = new Date(Date.now() - FAIL_WINDOW_MS);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vecJoinAttempts)
    .where(and(eq(vecJoinAttempts.ok, false), gt(vecJoinAttempts.createdAt, since), or(eq(vecJoinAttempts.userId, userId), ip ? eq(vecJoinAttempts.ip, ip) : sql`false`)));
  if ((r?.n ?? 0) >= FAIL_LIMIT) throw new ApiError(429, 'RATE_LIMITED', 'Bạn nhập sai quá nhiều lần. Thử lại sau vài phút.');
}

const logAttempt = (userId: string, ip: string | null, kind: 'CODE' | 'OTP', key: string | null, ok: boolean) =>
  db.insert(vecJoinAttempts).values({ userId, ip, kind, key, ok }).catch(() => undefined);

export async function prefill(userId: string): Promise<JoinPrefillDto> {
  const [u] = await db
    .select({ name: users.name, email: users.email, studentCode: users.studentCode, className: users.className, universityId: users.universityId, majorId: users.majorId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) throw ApiError.notFound();
  const unis = await db.select({ id: universities.id, name: universities.nameVi, short: universities.code, color: universities.color }).from(universities).orderBy(universities.code);
  const terms = await db
    .select({ universityId: academicTerms.universityId, code: academicTerms.code, name: academicTerms.name, startsOn: academicTerms.startsOn, endsOn: academicTerms.endsOn })
    .from(academicTerms)
    .orderBy(desc(academicTerms.startsOn))
    .limit(60);
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const termList = terms.map((t) => ({ universityId: t.universityId, code: t.code, name: t.name, current: !!t.startsOn && !!t.endsOn && t.startsOn <= today && today <= t.endsOn }));
  const myCurrent = termList.find((t) => t.current && t.universityId === u.universityId) ?? termList.find((t) => t.universityId === u.universityId);
  const [uni, maj] = await Promise.all([
    u.universityId ? db.select({ name: universities.nameVi }).from(universities).where(eq(universities.id, u.universityId)).limit(1) : [],
    u.majorId ? db.select({ name: majors.name }).from(majors).where(eq(majors.id, u.majorId)).limit(1) : [],
  ]);
  const info: CandidateInfo = {
    fullName: u.name,
    email: u.email,
    studentCode: u.studentCode ?? '',
    className: u.className ?? '',
    universityId: u.universityId ?? '',
    universityName: uni[0]?.name ?? '',
    majorName: maj[0]?.name ?? '',
    term: myCurrent ? (/^(FA|SP|SU)\d\d$/.test(myCurrent.code) ? `${myCurrent.code}_Block10` : myCurrent.code) : '',
    accountName: u.name,
  };
  return { info, universities: unis, terms: termList };
}

async function findByCode(code: string) {
  const [s] = await db
    .select()
    .from(vecSessions)
    .where(and(eq(vecSessions.roomCode, code), or(isNull(vecSessions.statusOverride), eq(vecSessions.statusOverride, 'PAUSED'))))
    .limit(1);
  return s ?? null;
}

export async function lookup(req: Request, userId: string, rawCode: string, otp?: string): Promise<JoinLookup> {
  const ip = clientIp(req);
  await assertNotLockedOut(userId, ip);
  const parsed = roomCodeSchema.safeParse(rawCode);
  if (!parsed.success) {
    await logAttempt(userId, ip, 'CODE', null, false);
    throw ApiError.badRequest('Mã phòng gồm 7 chữ số.', { code: 'Nhập đủ 7 chữ số.' });
  }
  const code = parsed.data;
  let s = await findByCode(code);
  if (!s) {
    await logAttempt(userId, ip, 'CODE', code, false);
    throw ApiError.notFound('Không tìm thấy phòng thi với mã này. Kiểm tra lại mã với giảng viên.');
  }
  s = await settleSession(s);
  if (s.hostId === userId) return { state: 'HOST' };

  const status = statusOf(s);
  const [part] = await db.select().from(vecParticipants).where(and(eq(vecParticipants.sessionId, s.id), eq(vecParticipants.userId, userId))).limit(1);
  const mine = await db.select().from(vecAttempts).where(and(eq(vecAttempts.userId, userId), eq(vecAttempts.sessionId, s.id))).orderBy(desc(vecAttempts.attemptNo));
  const active = mine.find((a) => (ACTIVE_ATTEMPT_STATES as readonly string[]).includes(a.state));
  if (active) return { state: 'ALREADY_ACTIVE', attemptId: active.id, title: s.title };

  // One live attempt per account, across sessions.
  const [other] = await db
    .select({ id: vecAttempts.id, title: vecSessions.title })
    .from(vecAttempts)
    .innerJoin(vecSessions, eq(vecSessions.id, vecAttempts.sessionId))
    .where(and(eq(vecAttempts.userId, userId), inArray(vecAttempts.state, ACTIVE_ATTEMPT_STATES as unknown as string[])))
    .limit(1);
  if (other) throw new ApiError(409, 'ALREADY_IN_OTHER', `Bạn đang có một bài thi chưa hoàn tất ở phòng “${other.title}”. Hãy hoàn tất bài đó trước.`);

  if (mine.length) {
    const ctx = await retakeContext(s, userId);
    return { state: 'ALREADY_SUBMITTED', attemptId: mine[0]!.id, title: s.title, canRetake: mine.some((a) => isFinishedAttempt(a.state)) && canStartRetake(ctx).ok };
  }

  if (status === 'ENDED' || status === 'CANCELLED') return { state: 'CLOSED' };
  if (status === 'SCHEDULED') return { state: 'NOT_OPEN', opensAt: lobbyOpensAt({ startsAt: s.startsAt.getTime(), lobbyOpenMin: s.lobbyOpenMin }), title: s.title, startsAt: s.startsAt.getTime(), durationMin: s.durationMin, subjectCode: s.subjectCode, subjectName: s.subjectName, lecturerDisplay: s.lecturerDisplay, questionCount: s.questionCount };
  if ((status === 'LIVE' || status === 'PAUSED') && Date.now() > joinClosesAt({ startsAt: s.startsAt.getTime(), lateJoinMin: s.lateJoinMin }) + (s.pausedTotalSec * 1000)) return { state: 'CLOSED' };

  const secret = decryptOtp(s.otpEnc);
  if (secret) {
    if (!otp) return { state: 'NEEDS_OTP', needsOtp: true };
    if (otp !== secret) {
      await logAttempt(userId, ip, 'OTP', code, false);
      throw ApiError.badRequest('Mã OTP chưa đúng.', { otp: 'Mã OTP chưa đúng.' });
    }
  }
  await logAttempt(userId, ip, 'CODE', code, true);
  const ticket = seal(TICKET, { sid: s.id, uid: userId }, 30 * 60_000);
  return { state: 'OK', ticket, session: await toJoinDto(s), needsOtp: false, ...(part ? {} : {}) };
}

export async function enter(req: Request, userId: string, ticket: string, info: CandidateInfo): Promise<{ attemptId: string }> {
  const t = unseal<{ sid: string; uid: string }>(TICKET, ticket);
  if (!t || t.uid !== userId) throw new ApiError(400, 'TICKET_EXPIRED', 'Phiên vào phòng đã hết hạn. Hãy nhập lại mã phòng.');
  let s = await db.select().from(vecSessions).where(eq(vecSessions.id, t.sid)).limit(1).then((r) => r[0]);
  if (!s) throw ApiError.notFound('Phòng thi không còn tồn tại.');
  s = await settleSession(s);
  const settings = s.settings as VecSettings;
  const status = statusOf(s);
  if (status === 'ENDED' || status === 'CANCELLED') throw ApiError.conflict('Phòng thi đã đóng.');
  if (status === 'SCHEDULED') throw ApiError.conflict('Phòng thi chưa mở.');
  if ((status === 'LIVE' || status === 'PAUSED') && Date.now() > joinClosesAt({ startsAt: s.startsAt.getTime(), lateJoinMin: s.lateJoinMin }) + s.pausedTotalSec * 1000)
    throw ApiError.conflict('Đã quá thời gian cho phép vào phòng muộn.');
  if (s.hostId === userId) throw ApiError.forbidden('Bạn là giảng viên của phiên này.');
  if (settings.access.requireStudentCode && !info.studentCode.trim()) throw ApiError.badRequest('Nhập mã số sinh viên.', { studentCode: 'Nhập mã số sinh viên.' });

  const [account] = await db.select({ name: users.name, studentCode: users.studentCode, className: users.className }).from(users).where(eq(users.id, userId)).limit(1);
  const lock = settings.access.lockProfileInfo;
  const stored: Record<string, string> = {
    ...info,
    fullName: lock ? account?.name ?? info.fullName : info.fullName,
    accountName: account?.name ?? info.accountName,
  };

  await db
    .insert(vecParticipants)
    .values({ sessionId: s.id, userId, candidateInfo: stored, firstIp: clientIp(req), firstUaHash: uaHash(req.get('user-agent')) })
    .onConflictDoNothing();

  const existing = await db.select().from(vecAttempts).where(and(eq(vecAttempts.sessionId, s.id), eq(vecAttempts.userId, userId))).orderBy(desc(vecAttempts.attemptNo)).limit(1);
  if (existing[0]) {
    if ((ACTIVE_ATTEMPT_STATES as readonly string[]).includes(existing[0].state)) return { attemptId: existing[0].id };
    throw ApiError.conflict('Bạn đã có bài làm trong phòng này.');
  }
  try {
    const a = await createAttempt(s.id, userId, 1);
    // Remember what they typed for next time, never overwriting a value they already saved.
    if (info.studentCode && !account?.studentCode) await db.update(users).set({ studentCode: info.studentCode.slice(0, 20) }).where(eq(users.id, userId));
    if (info.className && !account?.className) await db.update(users).set({ className: info.className.slice(0, 40) }).where(eq(users.id, userId));
    return { attemptId: a.id };
  } catch (e) {
    if (isUniqueViolation(e)) throw new ApiError(409, 'ALREADY_IN_OTHER', 'Bạn đang có một bài thi chưa hoàn tất ở nơi khác.');
    throw e;
  }
}

export async function meState(userId: string): Promise<MeStateDto> {
  const [active] = await db
    .select({ id: vecAttempts.id, sessionId: vecAttempts.sessionId, title: vecSessions.title, state: vecAttempts.state })
    .from(vecAttempts)
    .innerJoin(vecSessions, eq(vecSessions.id, vecAttempts.sessionId))
    .where(and(eq(vecAttempts.userId, userId), inArray(vecAttempts.state, ACTIVE_ATTEMPT_STATES as unknown as string[])))
    .limit(1);
  const hosting = await db
    .select()
    .from(vecSessions)
    .where(and(eq(vecSessions.hostId, userId), or(isNull(vecSessions.statusOverride), eq(vecSessions.statusOverride, 'PAUSED'))))
    .orderBy(desc(vecSessions.startsAt))
    .limit(20);
  return {
    attempt: active ? { id: active.id, sessionId: active.sessionId, title: active.title, state: active.state as MeStateDto['attempt'] extends infer T ? (T extends { state: infer S } ? S : never) : never } : null,
    hosting: hosting.map((h) => ({ id: h.id, title: h.title, status: statusOf(h) })),
  };
}

export { nextAttemptNo };
