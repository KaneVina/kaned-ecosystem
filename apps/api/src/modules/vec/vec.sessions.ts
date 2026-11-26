import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  MAX_START_LEAD_MS,
  PE_RETENTION_MS,
  MIN_START_LEAD_MS,
  computeEndsAt,
  csvCell,
  countedScore,
  defaultVecSettings,
  effectiveSessionStatus,
  fmtVnFull,
  gradeLabel,
  parseDeck,
  pickQuestions,
  riskLevel,
  seededRandom,
  toCsv,
  toSnapshot,
  vecSettingsSchema,
  type HistoryItemDto,
  type SessionInput,
  type SessionPatch,
  type SessionResultsDto,
  type VecSessionDto,
  type VecSettings,
  type DeckContent,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { decks, subjects, universities, users, vecAttempts, vecParticipants, vecSessionQuestions, vecSessions, vecMessages, vecAudit, type VecSessionRow } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { encryptOtp, newOtp, newRoomCode } from '../../lib/vec-crypto.js';
import { audit, countsFor, hostNameOf, isUniqueViolation, loadHostedSession, statusOf, toSessionDto } from './vec.common.js';
import { closeSession, finalizeAttempt, settleSession } from './vec.engine.js';
import { createPeSession, peCsv, purgeSessionFiles } from './vec.pe.js';

const RETENTION_MS = 180 * 24 * 3600_000;

/** Published decks a host may build an exam from, with only what the form needs. */
export async function listDecksForHost() {
  const rows = await db.execute<{
    id: string; title: string; question_count: number; subject_code: string; subject_name: string; color: string | null; chapters: Array<{ n: number; name: string }>; per_chapter: Record<string, number> | null;
  }>(sql`
    select d.id, d.title, d.question_count, s.code as subject_code, s.name_vi as subject_name, u.color,
           d.content->'chapters' as chapters,
           (select jsonb_object_agg(ch, n) from (select q->>'chapter' as ch, count(*)::int as n from jsonb_array_elements(d.content->'questions') q group by 1) x) as per_chapter
    from decks d
    join subjects s on s.id = d.subject_id
    left join universities u on u.id = s.university_id
    where d.status = 'PUBLISHED'
    order by s.code, d.title
    limit 400`);
  return [...rows].map((r) => ({
    id: r.id,
    title: r.title,
    questionCount: Number(r.question_count),
    subjectCode: r.subject_code,
    subjectName: r.subject_name,
    color: r.color,
    chapters: (r.chapters ?? []).map((c) => ({ n: c.n, name: c.name, count: Number(r.per_chapter?.[String(c.n)] ?? 0) })),
    unassigned: Number(r.per_chapter?.['0'] ?? 0),
  }));
}

async function createWithCode(values: Omit<typeof vecSessions.$inferInsert, 'roomCode'>): Promise<VecSessionRow> {
  for (let i = 0; i < 12; i++) {
    try {
      const [row] = await db.insert(vecSessions).values({ ...values, roomCode: newRoomCode() }).returning();
      return row!;
    } catch (e) {
      if (!isUniqueViolation(e, 'vec_active_room_code')) throw e;
    }
  }
  throw ApiError.internal('Không tạo được mã phòng, thử lại sau ít phút.');
}

export async function createSession(hostId: string, input: SessionInput): Promise<VecSessionDto> {
  if (input.kind === 'PE') return createPeSession(hostId, input, createWithCode);
  const now = Date.now();
  const startsAt = Date.parse(input.startsAt);
  if (startsAt < now + MIN_START_LEAD_MS) throw ApiError.badRequest('Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.', { startsAt: 'Chọn giờ muộn hơn.' });
  if (startsAt > now + MAX_START_LEAD_MS) throw ApiError.badRequest('Giờ bắt đầu quá xa (tối đa 180 ngày).', { startsAt: 'Chọn giờ gần hơn.' });
  const settings: VecSettings = vecSettingsSchema.parse(input.settings ?? defaultVecSettings());

  let content: DeckContent;
  let subjectCode = input.subjectCode ?? '';
  let subjectName = input.subjectName ?? '';
  let universityId: string | null = null;
  let deckId: string | null = null;
  let ephemeral = false;
  if (input.deckId) {
    const [d] = await db
      .select({ id: decks.id, status: decks.status, content: decks.content, subjectCode: subjects.code, subjectName: subjects.nameVi, universityId: subjects.universityId })
      .from(decks)
      .innerJoin(subjects, eq(decks.subjectId, subjects.id))
      .where(eq(decks.id, input.deckId))
      .limit(1);
    if (!d || d.status !== 'PUBLISHED') throw ApiError.notFound('Không tìm thấy bộ đề này.');
    content = d.content;
    subjectCode = subjectCode || d.subjectCode;
    subjectName = subjectName || d.subjectName;
    universityId = d.universityId ?? null;
    deckId = d.id;
  } else {
    const parsed = parseDeck(input.markdown!);
    const errors = parsed.issues.filter((i) => i.level === 'error');
    if (errors.length) throw ApiError.badRequest(`File .md có lỗi: dòng ${errors[0]!.line} – ${errors[0]!.message}`);
    content = parsed.content;
    ephemeral = true;
    subjectCode = subjectCode || parsed.meta.subject || 'TỰ TẠO';
    subjectName = subjectName || parsed.meta.title || 'Đề tải lên';
  }
  if (!content.questions.length) throw ApiError.badRequest('Bộ đề này chưa có câu hỏi nào.');

  const seed = randomBytes(12).toString('hex');
  const picked = pickQuestions(content.questions, settings.paper, seededRandom(`pick:${seed}`));
  if (!picked.length) throw ApiError.badRequest('Không có câu hỏi nào khớp phạm vi đã chọn.');
  const endsAt = computeEndsAt(startsAt, input.durationMin, settings.retake.max, settings.retake.extendWindow);

  const [host] = await db.select({ name: users.name }).from(users).where(eq(users.id, hostId)).limit(1);
  const otp = settings.access.otp ? input.otp ?? newOtp() : null;

  const session = await createWithCode({
    hostId,
    kind: 'FE',
    title: input.title,
    description: input.description ?? null,
    instructions: input.instructions ?? null,
    lecturerDisplay: input.lecturerDisplay || host?.name || 'Giảng viên',
    subjectCode: subjectCode.slice(0, 24),
    subjectName,
    universityId,
    deckId,
    ephemeral,
    otpEnc: otp ? encryptOtp(otp) : null,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    durationMin: input.durationMin,
    lobbyOpenMin: settings.timing.lobbyOpenMin,
    lateJoinMin: settings.timing.lateJoinMin,
    questionCount: picked.length,
    settings,
    expiresAt: new Date(endsAt + RETENTION_MS),
  });

  const snap = picked.map(toSnapshot);
  const byId = new Map(picked.map((q) => [q.id, q]));
  await db.insert(vecSessionQuestions).values(
    snap.map((q, i) => ({
      sessionId: session.id,
      qid: q.qid,
      position: i,
      chapter: q.chapter,
      kind: q.kind,
      text: q.text,
      options: q.options,
      answers: q.answers,
      canShuffle: q.canShuffle,
      explain: byId.get(q.qid)?.explain ?? null,
      note: byId.get(q.qid)?.note ?? null,
    })),
  );
  await audit(session.id, hostId, 'SESSION_CREATE', session.id, { title: session.title, questions: picked.length });
  return toSessionDto(session, { host: true, hostName: host?.name });
}

export async function listHosted(hostId: string): Promise<VecSessionDto[]> {
  let rows = await db.select().from(vecSessions).where(and(eq(vecSessions.hostId, hostId), or(isNull(vecSessions.statusOverride), sql`${vecSessions.statusOverride} <> 'DELETING'`))).orderBy(desc(vecSessions.startsAt)).limit(200);
  rows = await Promise.all(rows.map((r) => settleSession(r)));
  const counts = await countsFor(rows.map((r) => r.id));
  return Promise.all(rows.map((r) => toSessionDto(r, { host: true, counts: counts.get(r.id) })));
}

export async function getHosted(id: string, userId: string, role: string) {
  let s = await loadHostedSession(id, userId, role);
  s = await settleSession(s);
  return toSessionDto(s, { host: true, hostName: await hostNameOf(s.hostId) });
}

export async function patchSession(id: string, userId: string, role: string, patch: SessionPatch) {
  const s = await loadHostedSession(id, userId, role);
  const settings = { ...(s.settings as VecSettings) };
  const set: Partial<typeof vecSessions.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.instructions !== undefined) set.instructions = patch.instructions;
  if (patch.lecturerDisplay) set.lecturerDisplay = patch.lecturerDisplay;
  if (patch.results) settings.results = { ...settings.results, ...patch.results };
  if (patch.retakeMax !== undefined) {
    const status = statusOf(s);
    if (status === 'ENDED' || status === 'CANCELLED') throw ApiError.conflict('Phiên đã kết thúc, không đổi số lượt làm lại được.');
    settings.retake = { ...settings.retake, max: patch.retakeMax };
    set.endsAt = new Date(computeEndsAt(s.startsAt.getTime(), s.durationMin, patch.retakeMax, settings.retake.extendWindow));
    if (set.endsAt.getTime() < Date.now()) throw ApiError.conflict('Giờ kết thúc mới đã qua, hãy chọn số lượt nhiều hơn.');
  }
  set.settings = settings;
  const [u] = await db.update(vecSessions).set(set).where(eq(vecSessions.id, id)).returning();
  await audit(id, userId, 'SESSION_PATCH', id, { fields: Object.keys(patch) });
  return toSessionDto(u!, { host: true });
}

export async function pauseSession(id: string, userId: string, role: string) {
  const s = await loadHostedSession(id, userId, role);
  if (statusOf(s) !== 'LIVE') throw ApiError.conflict('Chỉ tạm dừng được khi phiên đang diễn ra.');
  const [u] = await db.update(vecSessions).set({ statusOverride: 'PAUSED', pausedAt: new Date() }).where(and(eq(vecSessions.id, id), isNull(vecSessions.statusOverride))).returning();
  if (!u) throw ApiError.conflict('Phiên vừa đổi trạng thái, hãy tải lại.');
  await audit(id, userId, 'SESSION_PAUSE', id);
  return toSessionDto(u, { host: true });
}

export async function resumeSession(id: string, userId: string, role: string) {
  const s = await loadHostedSession(id, userId, role);
  if (s.statusOverride !== 'PAUSED' || !s.pausedAt) throw ApiError.conflict('Phiên không đang tạm dừng.');
  const add = Math.max(0, Math.floor((Date.now() - s.pausedAt.getTime()) / 1000));
  const [u] = await db
    .update(vecSessions)
    .set({ statusOverride: null, pausedAt: null, pausedTotalSec: sql`${vecSessions.pausedTotalSec} + ${add}` })
    .where(and(eq(vecSessions.id, id), eq(vecSessions.statusOverride, 'PAUSED')))
    .returning();
  await audit(id, userId, 'SESSION_RESUME', id, { pausedSec: add });
  return toSessionDto(u ?? s, { host: true });
}

export async function endSession(id: string, userId: string, role: string) {
  const s = await loadHostedSession(id, userId, role);
  const status = statusOf(s);
  if (status === 'ENDED' || status === 'CANCELLED') throw ApiError.conflict('Phiên đã kết thúc.');
  if (status === 'SCHEDULED' || status === 'LOBBY') throw ApiError.conflict('Phiên chưa bắt đầu. Hãy hủy phiên nếu không muốn tổ chức nữa.');
  const now = Date.now();
  await closeSession(s, now, 'MANUAL');
  await audit(id, userId, 'SESSION_END', id);
  return getHosted(id, userId, role);
}

export async function cancelSession(id: string, userId: string, role: string) {
  const s = await loadHostedSession(id, userId, role);
  const status = statusOf(s);
  if (status !== 'SCHEDULED' && status !== 'LOBBY') throw ApiError.conflict('Chỉ hủy được phiên chưa bắt đầu.');
  await closeSession(s, Date.now(), 'MANUAL');
  await db.update(vecSessions).set({ statusOverride: 'CANCELLED' }).where(eq(vecSessions.id, id));
  await audit(id, userId, 'SESSION_CANCEL', id);
  return getHosted(id, userId, role);
}

export async function postponeSession(id: string, userId: string, role: string, startsAtIso: string) {
  const s = await loadHostedSession(id, userId, role);
  const status = statusOf(s);
  if (status !== 'SCHEDULED' && status !== 'LOBBY') throw ApiError.conflict('Chỉ dời được phiên chưa bắt đầu.');
  const startsAt = Date.parse(startsAtIso);
  if (!Number.isFinite(startsAt) || startsAt < Date.now() + MIN_START_LEAD_MS) throw ApiError.badRequest('Giờ mới phải cách hiện tại ít nhất 5 phút.');
  const settings = s.settings as VecSettings;
  const endsAt = computeEndsAt(startsAt, s.durationMin, settings.retake.max, settings.retake.extendWindow);
  await db.update(vecSessions).set({ startsAt: new Date(startsAt), endsAt: new Date(endsAt), expiresAt: new Date(endsAt + (s.kind === 'PE' ? PE_RETENTION_MS : RETENTION_MS)) }).where(eq(vecSessions.id, id));
  await db.insert(vecMessages).values({ sessionId: id, senderId: userId, kind: 'SYSTEM', body: `Giờ thi được dời sang ${fmtVnFull(startsAt)}.` });
  await audit(id, userId, 'SESSION_POSTPONE', id, { startsAt });
  return getHosted(id, userId, role);
}

export async function announce(id: string, userId: string, role: string, body: string, urgent: boolean, attemptId?: string) {
  const s = await loadHostedSession(id, userId, role);
  const status = statusOf(s);
  if (status === 'ENDED' || status === 'CANCELLED') throw ApiError.conflict('Phiên đã kết thúc.');
  const [m] = await db.insert(vecMessages).values({ sessionId: id, attemptId: attemptId ?? null, senderId: userId, kind: urgent ? 'URGENT' : 'ANNOUNCE', body }).returning({ id: vecMessages.id });
  await audit(id, userId, 'ANNOUNCE', attemptId ?? null, { urgent });
  return { id: m!.id };
}

export async function extendTime(id: string, userId: string, role: string, minutes: number, attemptIds?: string[]) {
  const s = await loadHostedSession(id, userId, role);
  const status = statusOf(s);
  if (status !== 'LIVE' && status !== 'PAUSED') throw ApiError.conflict('Chỉ cộng giờ khi phiên đang diễn ra.');
  const bonus = minutes * 60;
  const where = attemptIds?.length
    ? and(eq(vecAttempts.sessionId, id), inArray(vecAttempts.id, attemptIds), inArray(vecAttempts.state, ['IN_PROGRESS', 'SUSPENDED']))
    : and(eq(vecAttempts.sessionId, id), inArray(vecAttempts.state, ['IN_PROGRESS', 'SUSPENDED']));
  const upd = await db.update(vecAttempts).set({ timeBonusSec: sql`${vecAttempts.timeBonusSec} + ${bonus}` }).where(where).returning({ id: vecAttempts.id });
  // The whole room gets more time, so the session window has to stretch with it.
  if (!attemptIds?.length) await db.update(vecSessions).set({ endsAt: new Date(s.endsAt.getTime() + minutes * 60_000) }).where(eq(vecSessions.id, id));
  await db.insert(vecMessages).values({
    sessionId: id,
    senderId: userId,
    attemptId: attemptIds?.length === 1 ? attemptIds[0]! : null,
    kind: 'SYSTEM',
    body: `Giảng viên cộng thêm ${minutes} phút làm bài.`,
  });
  await audit(id, userId, 'EXTEND_TIME', attemptIds?.join(',') ?? 'ALL', { minutes, affected: upd.length });
  return { affected: upd.length };
}

export async function releaseResults(id: string, userId: string, role: string) {
  await loadHostedSession(id, userId, role);
  await db.update(vecSessions).set({ resultsReleasedAt: new Date() }).where(eq(vecSessions.id, id));
  await audit(id, userId, 'RELEASE_RESULTS', id);
  return { ok: true };
}

export async function deleteSession(id: string, userId: string, role: string, confirm: string) {
  const s = await loadHostedSession(id, userId, role);
  const status = statusOf(s);
  if (status === 'LIVE' || status === 'PAUSED' || status === 'LOBBY') throw ApiError.conflict('Hãy kết thúc phiên trước khi xóa.');
  if (confirm.replace(/\D/g, '') !== s.roomCode) throw ApiError.badRequest('Mã phòng xác nhận chưa đúng.', { confirm: 'Nhập đúng mã phòng.' });
  await db.update(vecSessions).set({ statusOverride: 'DELETING' }).where(eq(vecSessions.id, id));
  // Files go first: their rows lose the session link once the room is gone.
  const files = s.kind === 'PE' ? await purgeSessionFiles(id) : 0;
  await db.delete(vecSessions).where(eq(vecSessions.id, id));
  await audit(null, userId, 'SESSION_DELETE', null, { title: s.title, participants: (await countsFor([id])).get(id)?.joined ?? 0, files });
  return { ok: true };
}

/* ─────────────────────────── results & history ─────────────────────────── */

function stats(scores: number[], durations: number[], passMark: number) {
  if (!scores.length) return { avg: null, median: null, max: null, min: null, stdev: null, passRate: null, avgDurationSec: null };
  const sorted = scores.slice().sort((a, b) => a - b);
  const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const variance = scores.reduce((s, x) => s + (x - avg) ** 2, 0) / scores.length;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    avg: r2(avg),
    median: r2(median),
    max: sorted[sorted.length - 1]!,
    min: sorted[0]!,
    stdev: r2(Math.sqrt(variance)),
    passRate: r2((scores.filter((x) => x >= passMark).length / scores.length) * 100),
    avgDurationSec: durations.length ? Math.round(durations.reduce((s, x) => s + x, 0) / durations.length) : null,
  };
}

export async function sessionResults(id: string, userId: string, role: string): Promise<SessionResultsDto> {
  let s = await loadHostedSession(id, userId, role);
  s = await settleSession(s);
  const settings = s.settings as VecSettings;
  const parts = await db.select().from(vecParticipants).where(eq(vecParticipants.sessionId, id));
  const atts = await db.select().from(vecAttempts).where(eq(vecAttempts.sessionId, id));
  const byUser = new Map<string, typeof atts>();
  for (const a of atts) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);

  const rows: SessionResultsDto['rows'] = parts.map((p) => {
    const list = (byUser.get(p.userId) ?? []).sort((a, b) => a.attemptNo - b.attemptNo);
    const latest = list[list.length - 1];
    const counted = countedScore(list.map((a) => ({ attemptNo: a.attemptNo, score10: a.score10, submittedAt: a.submittedAt?.getTime() ?? null })), settings.retake.scoring);
    const ref = counted?.attemptNo ? list.find((a) => a.attemptNo === counted.attemptNo) : latest;
    const info = p.candidateInfo;
    const lock = list.reduce((n, a) => n + a.violationLock, 0);
    const warn = list.reduce((n, a) => n + a.violationWarn, 0);
    const risk = list.reduce((n, a) => n + a.riskScore, 0);
    return {
      userId: p.userId,
      fullName: info.fullName ?? '',
      studentCode: info.studentCode ?? '',
      email: info.email ?? '',
      className: info.className ?? '',
      attempts: list.length,
      counted: counted?.score ?? null,
      countedAttemptNo: counted?.attemptNo ?? null,
      correct: ref?.correctCount ?? null,
      wrong: ref?.wrongCount ?? null,
      blank: ref?.blankCount ?? null,
      submittedAt: ref?.submittedAt?.getTime() ?? null,
      lock,
      warn,
      risk,
      state: (latest?.state ?? 'LOBBY') as SessionResultsDto['rows'][number]['state'],
      paperCode: latest?.paperCode ?? '',
    };
  });
  const scored = rows.filter((r) => r.counted != null);
  const durations = atts.filter((a) => a.startedAt && a.submittedAt && a.score10 != null).map((a) => Math.round((a.submittedAt!.getTime() - a.startedAt!.getTime()) / 1000));
  const dist = Array.from({ length: 10 }, () => 0);
  for (const r of scored) dist[Math.min(9, Math.floor(r.counted!))]!++;
  return {
    session: await toSessionDto(s, { host: true }),
    stats: { candidates: rows.length, submitted: scored.length, ...stats(scored.map((r) => r.counted!), durations, settings.scoring.passMark) },
    distribution: dist,
    rows: rows.sort((a, b) => (b.counted ?? -1) - (a.counted ?? -1)),
    released: s.resultsReleasedAt != null,
  };
}

export async function resultsCsv(id: string, userId: string, role: string) {
  const host = await loadHostedSession(id, userId, role);
  if (host.kind === 'PE') return peCsv(host, userId);
  const r = await sessionResults(id, userId, role);
  const header = ['STT', 'Mã SV', 'Họ và tên', 'Email', 'Lớp', 'Số lượt', 'Điểm tính', 'Xếp loại', 'Đúng', 'Sai', 'Bỏ trống', 'Nộp lúc', 'Khóa bài', 'Cảnh báo', 'Rủi ro', 'Trạng thái', 'Mã đề'];
  const rows = r.rows.map((x, i) => [
    i + 1, x.studentCode, x.fullName, x.email, x.className, x.attempts, x.counted ?? '', x.counted != null ? gradeLabel(x.counted) : '',
    x.correct ?? '', x.wrong ?? '', x.blank ?? '', x.submittedAt ? fmtVnFull(x.submittedAt) : '', x.lock, x.warn, riskLevel(x.risk), x.state, x.paperCode,
  ]);
  await audit(id, userId, 'EXPORT_CSV', id, { rows: rows.length });
  const name = `ket-qua-${r.session.roomCode}.csv`;
  return { name, body: toCsv([header, ...rows]), csvCell };
}

export async function hostedHistory(userId: string): Promise<HistoryItemDto[]> {
  const rows = await listHosted(userId);
  const ended = rows.filter((r) => r.status === 'ENDED' || r.status === 'CANCELLED');
  const out: HistoryItemDto[] = [];
  for (const r of ended) {
    const res = await sessionResults(r.id, userId, 'STUDENT').catch(() => null);
    out.push({ id: r.id, sessionId: r.id, kind: r.kind, title: r.title, subjectCode: r.subjectCode, startsAt: r.startsAt, status: r.status, roomCode: r.roomCode, candidates: r.counts.joined, avg: res?.stats.avg ?? null, passRate: res?.stats.passRate ?? null });
  }
  return out;
}

export { effectiveSessionStatus, universities, vecAudit, finalizeAttempt };
