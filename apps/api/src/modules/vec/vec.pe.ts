import type { Request, Response } from 'express';
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import {
  MAX_START_LEAD_MS,
  MIN_START_LEAD_MS,
  PE_LATE_UPLOAD_GRACE_MS,
  PE_MAX_UPLOAD_MB,
  PE_PAPER_FORMATS,
  PE_RETENTION_MS,
  computeEndsAt,
  defaultVecSettings,
  fileAllowed,
  fmtVnFull,
  gradeLabel,
  isFinishedAttempt,
  peFormatOf,
  toCsv,
  vecSettingsSchema,
  type PeFileRole,
  type PeGradingDto,
  type PeItemDto,
  type PePaperDocDto,
  type PeRoomDto,
  type PeStoredConfig,
  type PeStoredItem,
  type PeSubmissionDto,
  type PeUploadTicket,
  type SessionInput,
  type VecSessionDto,
  type VecSettings,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import {
  documents,
  subjects,
  users,
  vecAttempts,
  vecFiles,
  vecParticipants,
  vecSessions,
  vecSubmissions,
  type VecAttemptRow,
  type VecFileRow,
  type VecSessionRow,
} from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { storage } from '../../lib/storage.js';
import { blobTicket, newBlobKey, readBlobTicket, vecBlob } from '../../lib/vec-blob.js';
import { encryptOtp, newOtp } from '../../lib/vec-crypto.js';
import { blockedPage, embedHeaders, protectedEmbed, renderEmbed } from '../documents/embed.js';
import { audit, loadHostedSession, ms, statusOf, toSessionDto } from './vec.common.js';
import { deadlineOf, finalizeAttempt, logEvent, recomputeCounted, settleSession } from './vec.engine.js';

const MB = 1024 * 1024;
const PAPER_VIEW_TTL = 3 * 3600_000;

/* ─────────────────────────── library picker ─────────────────────────── */

/** Published documents a lecturer can use as a paper or as a material. */
export async function libraryPick(q: string, hostId: string) {
  const k = q.trim().slice(0, 80);
  const like = `%${k.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db.execute<{
    id: string; title: string; format: string; file_bytes: number; internal: boolean; allow_download: boolean; uploader_id: string; code: string; name_vi: string; pages: number | null;
  }>(sql`
    select d.id, d.title, d.format, d.file_bytes, d.internal, d.allow_download, d.uploader_id, d.pages, s.code, s.name_vi
    from documents d join subjects s on s.id = d.subject_id
    where d.status = 'PUBLISHED'
      and (${k} = '' or d.title ilike ${like} or s.code ilike ${like} or s.name_vi ilike ${like})
    order by (s.code ilike ${k + '%'}) desc, d.created_at desc
    limit 40`);
  return [...rows].map((r) => ({
    id: r.id,
    title: r.title,
    format: r.format,
    bytes: Number(r.file_bytes) || 0,
    pages: r.pages,
    subjectCode: r.code,
    subjectName: r.name_vi,
    /** Can be shown in the paper window. */
    paperOk: r.format !== 'LINK' && r.format !== 'GITHUB',
    /** Can be handed out for download. */
    materialOk: !(r.internal && !r.allow_download && r.uploader_id !== hostId),
  }));
}

/* ─────────────────────────── uploads ─────────────────────────── */

async function attemptOf(attemptId: string, userId: string) {
  const [a] = await db.select().from(vecAttempts).where(eq(vecAttempts.id, attemptId)).limit(1);
  if (!a || a.userId !== userId) throw ApiError.notFound('Không tìm thấy bài thi.');
  const [s0] = await db.select().from(vecSessions).where(eq(vecSessions.id, a.sessionId)).limit(1);
  if (!s0 || s0.kind !== 'PE' || !s0.pe) throw ApiError.notFound('Phòng thi không còn tồn tại.');
  const s = await settleSession(s0);
  const [fresh] = await db.select().from(vecAttempts).where(eq(vecAttempts.id, attemptId)).limit(1);
  return { attempt: fresh ?? a, session: s, cfg: s.pe as PeStoredConfig };
}

/** Whether the candidate may still hand in work, and whether it counts as late. */
function submitWindow(a: VecAttemptRow, s: VecSessionRow, signedAt: number, now = Date.now()): { ok: boolean; late: boolean; why?: string } {
  if (a.peClosedAt) return { ok: false, late: false, why: 'Bạn đã ký danh sách và đóng phòng thi.' };
  if (a.state === 'IN_PROGRESS') {
    const status = statusOf(s, now);
    if (status === 'PAUSED') return { ok: false, late: false, why: 'Giảng viên đang tạm dừng phòng thi.' };
    const dl = deadlineOf(a, s, now);
    if (dl != null && now > dl) return signedAt <= dl && now <= dl + PE_LATE_UPLOAD_GRACE_MS ? { ok: true, late: true } : { ok: false, late: false, why: 'Đã hết giờ làm bài.' };
    return { ok: true, late: false };
  }
  // The clock closed the attempt while the last upload was still on its way.
  if (a.state === 'AUTO_SUBMITTED' && a.submittedAt && signedAt <= a.submittedAt.getTime() && now <= a.submittedAt.getTime() + PE_LATE_UPLOAD_GRACE_MS) return { ok: true, late: true };
  return { ok: false, late: false, why: 'Bài thi đã kết thúc, không nộp thêm được.' };
}

/** Starts one upload: a row that remembers where the file goes, and where the browser sends it. */
export async function signFile(userId: string, body: { role: PeFileRole; attemptId?: string; name: string; bytes: number }): Promise<PeUploadTicket> {
  const format = peFormatOf(body.name);
  let scope = `draft/${userId}`;
  let sessionId: string | null = null;
  let attemptId: string | null = null;
  if (body.role === 'SUBMISSION') {
    if (!body.attemptId) throw ApiError.badRequest('Thiếu bài thi.');
    const { attempt: a, session: s, cfg } = await attemptOf(body.attemptId, userId);
    const w = submitWindow(a, s, Date.now());
    if (!w.ok || w.late) throw ApiError.conflict(w.why ?? 'Đã hết giờ làm bài.');
    if (body.bytes > cfg.submission.maxSizeMb * MB) throw ApiError.tooLarge(`Bài làm vượt quá ${cfg.submission.maxSizeMb} MB.`);
    const isFolderZip = /\.zip$/i.test(body.name) && cfg.submission.allowFolder;
    if (!isFolderZip && !fileAllowed(body.name, cfg.submission)) throw ApiError.badRequest('Loại tệp này không được nộp trong phòng thi.');
    scope = `${s.id}/${a.id}`;
    sessionId = s.id;
    attemptId = a.id;
  } else if (body.bytes > PE_MAX_UPLOAD_MB * MB) {
    throw ApiError.tooLarge(`Tệp vượt quá ${PE_MAX_UPLOAD_MB} MB.`);
  } else if (body.role === 'PAPER' && !(PE_PAPER_FORMATS as readonly string[]).includes(format)) {
    throw ApiError.badRequest('Đề thi cần là PDF, Word, PowerPoint, Excel, Markdown, văn bản hoặc hình ảnh.');
  }
  const key = newBlobKey(scope, body.name);
  const [row] = await db
    .insert(vecFiles)
    .values({ sessionId, attemptId, ownerId: userId, role: body.role, name: body.name, format, bytes: body.bytes, storage: vecBlob.mode, storageKey: key })
    .returning({ id: vecFiles.id });
  return { fileId: row!.id, ...vecBlob.uploadTarget(row!.id, key) };
}

/** Disk mode: the bytes of one upload, sent to the API with the ticket from signFile. */
export async function receiveBlob(req: Request, fileId: string, ticket: string) {
  if (!readBlobTicket(ticket, fileId, 'up')) throw ApiError.forbidden('Phiên tải lên đã hết hạn.');
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, fileId)).limit(1);
  if (!f || f.status !== 'PENDING' || f.storage !== 'DISK') throw ApiError.notFound('Không tìm thấy tệp.');
  const n = await vecBlob.receive(req, f.storageKey, f.bytes + 64 * 1024);
  return { bytes: n };
}

/** Disk mode: sends a stored file to whoever holds a valid ticket. */
export async function sendBlob(res: Response, fileId: string, ticket: string, attachment: boolean) {
  if (!readBlobTicket(ticket, fileId, attachment ? 'down' : 'view')) return res.status(403).end();
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, fileId)).limit(1);
  if (!f || f.storage !== 'DISK') return res.status(404).end();
  return vecBlob.send(res, f.storageKey, f.name, attachment);
}

/** Checks the stored file really arrived; returns its size. */
async function confirmStored(f: VecFileRow): Promise<number> {
  const size = await vecBlob.sizeOf(f.storageKey);
  if (size == null) throw ApiError.conflict('Tệp chưa tải lên xong, thử lại.');
  return size < 0 ? f.bytes : size;
}

/** Lecturer: an uploaded paper or material is ready to be attached to the room being created. */
export async function finishDraft(userId: string, fileId: string): Promise<PeItemDto> {
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, fileId)).limit(1);
  if (!f || f.ownerId !== userId || f.role === 'SUBMISSION') throw ApiError.notFound('Không tìm thấy tệp.');
  const bytes = await confirmStored(f);
  await db.update(vecFiles).set({ status: 'READY', bytes, readyAt: new Date() }).where(eq(vecFiles.id, f.id));
  return { id: f.id, source: 'UPLOAD', name: f.name, format: f.format, bytes };
}

export async function dropDraft(userId: string, fileId: string) {
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, fileId)).limit(1);
  if (!f || f.ownerId !== userId || f.sessionId) return { ok: true };
  await vecBlob.destroyMany([f.storageKey]);
  await db.delete(vecFiles).where(eq(vecFiles.id, f.id));
  return { ok: true };
}

/* ─────────────────────────── creating a room ─────────────────────────── */

type CreateWithCode = (values: Omit<typeof vecSessions.$inferInsert, 'roomCode'>) => Promise<VecSessionRow>;

export async function createPeSession(hostId: string, input: SessionInput, createWithCode: CreateWithCode): Promise<VecSessionDto> {
  const pe = input.pe!;
  const now = Date.now();
  const startsAt = Date.parse(input.startsAt);
  if (startsAt < now + MIN_START_LEAD_MS) throw ApiError.badRequest('Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.', { startsAt: 'Chọn giờ muộn hơn.' });
  if (startsAt > now + MAX_START_LEAD_MS) throw ApiError.badRequest('Giờ bắt đầu quá xa (tối đa 180 ngày).', { startsAt: 'Chọn giờ gần hơn.' });

  const all = [...pe.paper.map((x) => ({ ...x, role: 'PAPER' as const })), ...pe.materials.map((x) => ({ ...x, role: 'MATERIAL' as const }))];
  const docIds = [...new Set(all.flatMap((x) => (x.source === 'LIBRARY' ? [x.documentId] : [])))];
  const fileIds = [...new Set(all.flatMap((x) => (x.source === 'UPLOAD' ? [x.fileId] : [])))];
  const docs = docIds.length
    ? await db
        .select({ id: documents.id, title: documents.title, format: documents.format, bytes: documents.fileBytes, status: documents.status, internal: documents.internal, allowDownload: documents.allowDownload, uploaderId: documents.uploaderId, subjectCode: subjects.code, subjectName: subjects.nameVi, universityId: subjects.universityId })
        .from(documents)
        .innerJoin(subjects, eq(subjects.id, documents.subjectId))
        .where(inArray(documents.id, docIds))
    : [];
  const files = fileIds.length ? await db.select().from(vecFiles).where(inArray(vecFiles.id, fileIds)) : [];
  const docBy = new Map(docs.map((d) => [d.id, d]));
  const fileBy = new Map(files.map((f) => [f.id, f]));

  const stored = (role: 'PAPER' | 'MATERIAL') => (x: (typeof all)[number]): PeStoredItem => {
    if (x.source === 'LIBRARY') {
      const d = docBy.get(x.documentId);
      if (!d || d.status !== 'PUBLISHED') throw ApiError.badRequest('Có tài liệu trong kho không còn được công khai.');
      if (role === 'PAPER' && (d.format === 'LINK' || d.format === 'GITHUB')) throw ApiError.badRequest(`“${d.title}” là liên kết, không dùng làm đề được.`);
      if (role === 'MATERIAL' && d.internal && !d.allowDownload && d.uploaderId !== hostId) throw ApiError.badRequest(`“${d.title}” không cho phép tải về.`);
      return { source: 'LIBRARY', ref: d.id, name: d.title, format: d.format, bytes: Number(d.bytes) || 0 };
    }
    const f = fileBy.get(x.fileId);
    if (!f || f.ownerId !== hostId || f.sessionId || f.status !== 'READY' || f.role !== role) throw ApiError.badRequest('Có tệp tải lên chưa xong hoặc đã bị xóa, hãy tải lại.');
    return { source: 'UPLOAD', ref: f.id, name: f.name, format: f.format, bytes: f.bytes };
  };
  const cfg: PeStoredConfig = {
    examCode: pe.examCode.toUpperCase(),
    paper: all.filter((x) => x.role === 'PAPER').map(stored('PAPER')),
    materials: all.filter((x) => x.role === 'MATERIAL').map(stored('MATERIAL')),
    protect: pe.protect,
    submission: pe.submission,
  };

  const firstDoc = docs[0];
  const subjectCode = (input.subjectCode || firstDoc?.subjectCode || cfg.examCode.split('_')[0] || 'PE').slice(0, 24);
  const subjectName = input.subjectName || firstDoc?.subjectName || 'Thi thực hành';
  const base = vecSettingsSchema.parse(input.settings ?? defaultVecSettings());
  const settings: VecSettings = {
    ...base,
    retake: { ...base.retake, max: 0 },
    integrity: { ...base.integrity, preset: 'RELAXED', blockCopy: pe.protect.noCopy, watermark: pe.protect.watermark },
  };
  const endsAt = computeEndsAt(startsAt, input.durationMin, 0, false);
  const [host] = await db.select({ name: users.name }).from(users).where(eq(users.id, hostId)).limit(1);
  const otp = settings.access.otp ? input.otp ?? newOtp() : null;

  const session = await createWithCode({
    hostId,
    kind: 'PE',
    title: input.title,
    description: input.description ?? null,
    instructions: input.instructions ?? null,
    lecturerDisplay: input.lecturerDisplay || host?.name || 'Giảng viên',
    subjectCode,
    subjectName,
    universityId: firstDoc?.universityId ?? null,
    deckId: null,
    ephemeral: false,
    otpEnc: otp ? encryptOtp(otp) : null,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    durationMin: input.durationMin,
    lobbyOpenMin: settings.timing.lobbyOpenMin,
    lateJoinMin: settings.timing.lateJoinMin,
    questionCount: 0,
    settings,
    pe: cfg,
    expiresAt: new Date(endsAt + PE_RETENTION_MS),
  });
  if (fileIds.length) await db.update(vecFiles).set({ sessionId: session.id }).where(and(inArray(vecFiles.id, fileIds), eq(vecFiles.ownerId, hostId)));
  await audit(session.id, hostId, 'SESSION_CREATE', session.id, { title: session.title, kind: 'PE', examCode: cfg.examCode, paper: cfg.paper.length, materials: cfg.materials.length });
  return toSessionDto(session, { host: true, hostName: host?.name });
}

/* ─────────────────────────── the candidate's room ─────────────────────────── */

const toItem = (x: PeStoredItem): PeItemDto => ({ id: x.ref, source: x.source, name: x.name, format: x.format, bytes: x.bytes });

const subDto = (r: typeof vecSubmissions.$inferSelect): PeSubmissionDto => ({
  id: r.id,
  no: r.no,
  path: r.path,
  fileName: r.fileName,
  fileCount: r.fileCount,
  bytes: r.bytes,
  sha256: r.sha256,
  note: r.note,
  late: r.late,
  createdAt: r.createdAt.getTime(),
});

async function submissionsOf(attemptId: string) {
  return db.select().from(vecSubmissions).where(eq(vecSubmissions.attemptId, attemptId)).orderBy(desc(vecSubmissions.no));
}

function gradeVisible(a: VecAttemptRow, s: VecSessionRow) {
  if (a.gradedAt == null) return false;
  const rule = (s.settings as VecSettings).results.score;
  if (rule === 'NEVER') return false;
  if (rule === 'AFTER_SUBMIT') return true;
  if (rule === 'AFTER_END') return statusOf(s) === 'ENDED';
  return Boolean(s.resultsReleasedAt);
}

export async function peRoom(userId: string, attemptId: string): Promise<PeRoomDto> {
  const { attempt: a, session: s, cfg } = await attemptOf(attemptId, userId);
  const subs = await submissionsOf(a.id);
  return {
    examCode: cfg.examCode,
    paper: cfg.paper.map(toItem),
    materials: cfg.materials.map(toItem),
    protect: cfg.protect,
    submission: cfg.submission,
    submissions: subs.map(subDto),
    closedAt: ms(a.peClosedAt),
    grade: gradeVisible(a, s) ? { score10: a.score10, note: a.gradeNote, gradedAt: ms(a.gradedAt) } : null,
  };
}

/** Paper and materials are open only while the candidate is working. */
function assertWorking(a: VecAttemptRow, s: VecSessionRow) {
  if (a.state !== 'IN_PROGRESS' || a.peClosedAt) throw ApiError.conflict('Đề thi chỉ mở trong lúc làm bài.');
  if (statusOf(s) === 'PAUSED') throw ApiError.conflict('Giảng viên đang tạm dừng phòng thi.');
}

async function paperDocs(cfg: PeStoredConfig, userId: string): Promise<PePaperDocDto[]> {
  const libIds = cfg.paper.filter((x) => x.source === 'LIBRARY').map((x) => x.ref);
  const upIds = cfg.paper.filter((x) => x.source === 'UPLOAD').map((x) => x.ref);
  const libRows = libIds.length
    ? await db.select({ id: documents.id, format: documents.format, fileUrl: documents.fileUrl, filePublicId: documents.filePublicId, title: documents.title, thumbnailUrl: documents.thumbnailUrl, status: documents.status }).from(documents).where(inArray(documents.id, libIds))
    : [];
  const upRows = upIds.length ? await db.select().from(vecFiles).where(inArray(vecFiles.id, upIds)) : [];
  const out: PePaperDocDto[] = [];
  for (const item of cfg.paper) {
    if (item.source === 'LIBRARY') {
      const row = libRows.find((r) => r.id === item.ref);
      if (!row || row.status === 'REMOVED') {
        out.push({ id: item.ref, name: item.name, format: item.format, src: null });
        continue;
      }
      const e = protectedEmbed(row, userId);
      out.push({ id: row.id, name: item.name, format: row.format, src: e?.src ?? null, ...(e?.docx ? { docx: e.docx } : {}) });
      continue;
    }
    const f = upRows.find((r) => r.id === item.ref);
    if (!f) {
      out.push({ id: item.ref, name: item.name, format: item.format, src: null });
      continue;
    }
    const t = encodeURIComponent(blobTicket(f.id, 'view', PAPER_VIEW_TTL));
    if (f.format === 'IMAGE') out.push({ id: f.id, name: f.name, format: f.format, src: null, image: vecBlob.link(f.id, f.storageKey, { attachment: false }) });
    else if (f.format === 'TEXT') out.push({ id: f.id, name: f.name, format: f.format, src: null, text: await readText(f) });
    else out.push({ id: f.id, name: f.name, format: f.format, src: `/api/vec/embed/${f.id}/${t}`, ...(f.format === 'DOCX' ? { docx: `/api/vec/embed/${f.id}/${t}/file` } : {}) });
  }
  return out;
}

async function readText(f: VecFileRow): Promise<string> {
  try {
    if (f.storage === 'DISK') {
      const { default: path } = await import('node:path');
      const buf = await readFile(path.resolve(process.cwd(), '.data', 'vec', f.storageKey));
      return buf.subarray(0, 400_000).toString('utf8');
    }
    const r = await fetch(vecBlob.link(f.id, f.storageKey, { attachment: false }), { signal: AbortSignal.timeout(10_000) });
    return (await r.text()).slice(0, 400_000);
  } catch {
    return 'Không đọc được tệp này.';
  }
}

export async function candidatePaper(userId: string, attemptId: string) {
  const { attempt: a, session: s, cfg } = await attemptOf(attemptId, userId);
  assertWorking(a, s);
  await logEvent(a, 'PE_PAPER', 'INFO');
  return { examCode: cfg.examCode, title: s.title, protect: cfg.protect, docs: await paperDocs(cfg, userId) };
}

export async function hostPaper(sessionId: string, userId: string, role: string) {
  const s = await loadHostedSession(sessionId, userId, role);
  if (s.kind !== 'PE' || !s.pe) throw ApiError.notFound('Phiên này không phải phòng thi thực hành.');
  return { examCode: s.pe.examCode, title: s.title, protect: s.pe.protect, docs: await paperDocs(s.pe, userId) };
}

async function itemLink(item: PeStoredItem): Promise<{ url: string; kind: 'download' | 'link'; name: string }> {
  if (item.source === 'LIBRARY') {
    const [d] = await db.select().from(documents).where(eq(documents.id, item.ref)).limit(1);
    if (!d || d.status === 'REMOVED') throw ApiError.notFound('Tài liệu này không còn trong kho.');
    if (d.format === 'LINK' || d.format === 'GITHUB') return { url: d.fileUrl, kind: 'link', name: d.title };
    return { url: storage.deliveryUrl({ fileUrl: d.fileUrl, filePublicId: d.filePublicId, format: d.format }, { attachment: true }), kind: 'download', name: d.title };
  }
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, item.ref)).limit(1);
  if (!f) throw ApiError.notFound('Tệp này không còn nữa.');
  return { url: vecBlob.link(f.id, f.storageKey, { attachment: true }), kind: 'download', name: f.name };
}

export async function candidateMaterial(userId: string, attemptId: string, ref: string) {
  const { attempt: a, session: s, cfg } = await attemptOf(attemptId, userId);
  assertWorking(a, s);
  const item = cfg.materials.find((x) => x.ref === ref);
  if (!item) throw ApiError.notFound('Không tìm thấy tài liệu.');
  await logEvent(a, 'PE_MATERIAL', 'INFO', { name: item.name });
  return itemLink(item);
}

/** A finished upload becomes the candidate's newest submission. Older ones past the keep limit are deleted. */
export async function submitSolution(userId: string, attemptId: string, body: { fileId: string; path: string; fileCount: number; sha256: string; note?: string; skipped: number }) {
  const { attempt: a, session: s, cfg } = await attemptOf(attemptId, userId);
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, body.fileId)).limit(1);
  if (!f || f.ownerId !== userId || f.attemptId !== a.id || f.role !== 'SUBMISSION' || f.status !== 'PENDING') throw ApiError.notFound('Không tìm thấy tệp vừa tải lên.');
  const w = submitWindow(a, s, f.createdAt.getTime());
  if (!w.ok) throw ApiError.conflict(w.why ?? 'Không nộp được nữa.');
  const bytes = await confirmStored(f);
  if (bytes > cfg.submission.maxSizeMb * MB + 64 * 1024) {
    await vecBlob.destroyMany([f.storageKey]);
    await db.delete(vecFiles).where(eq(vecFiles.id, f.id));
    throw ApiError.tooLarge(`Bài làm vượt quá ${cfg.submission.maxSizeMb} MB.`);
  }
  const [last] = await db.select({ no: sql<number>`coalesce(max(${vecSubmissions.no}), 0)::int` }).from(vecSubmissions).where(eq(vecSubmissions.attemptId, a.id));
  const no = (last?.no ?? 0) + 1;
  await db.update(vecFiles).set({ status: 'READY', bytes, sha256: body.sha256, readyAt: new Date() }).where(eq(vecFiles.id, f.id));
  await db.insert(vecSubmissions).values({
    sessionId: s.id,
    attemptId: a.id,
    userId,
    no,
    fileId: f.id,
    path: body.path.slice(0, 400),
    fileName: f.name,
    fileCount: body.fileCount,
    bytes,
    sha256: body.sha256,
    note: body.note?.trim() || null,
    late: w.late,
  });
  // Keep the newest few; the rest go, file and all.
  const all = await submissionsOf(a.id);
  const old = all.slice(cfg.submission.keepVersions);
  if (old.length) {
    const oldFiles = await db.select().from(vecFiles).where(inArray(vecFiles.id, old.map((o) => o.fileId!).filter(Boolean)));
    await vecBlob.destroyMany(oldFiles.map((x) => x.storageKey));
    await db.delete(vecSubmissions).where(inArray(vecSubmissions.id, old.map((o) => o.id)));
    if (oldFiles.length) await db.delete(vecFiles).where(inArray(vecFiles.id, oldFiles.map((x) => x.id)));
  }
  await logEvent(a, w.late ? 'PE_SUBMIT_LATE' : 'PE_SUBMIT', 'INFO', { no, bytes, files: body.fileCount, sha256: body.sha256.slice(0, 12), skipped: body.skipped });
  return peRoom(userId, attemptId);
}

/** Step 3: the candidate has signed the list. Their attempt ends here. */
export async function closeRoom(userId: string, attemptId: string) {
  const { attempt: a, session: s, cfg } = await attemptOf(attemptId, userId);
  if (a.peClosedAt) return peRoom(userId, attemptId);
  if (a.state === 'IN_PROGRESS') {
    if (cfg.submission.required) {
      const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(vecSubmissions).where(eq(vecSubmissions.attemptId, a.id));
      if (!n?.n) throw ApiError.conflict('Bạn chưa nộp bài. Hãy nộp bài làm (bước 2) trước khi đóng.');
    }
    await finalizeAttempt(a, 'SUBMITTED', 'CANDIDATE');
  } else if (!isFinishedAttempt(a.state as never)) {
    throw ApiError.conflict('Bài thi chưa bắt đầu.');
  }
  await db.update(vecAttempts).set({ peClosedAt: new Date() }).where(eq(vecAttempts.id, a.id));
  await logEvent(a, 'PE_CLOSE', 'INFO');
  void s;
  return peRoom(userId, attemptId);
}

/* ─────────────────────────── embed of an uploaded paper ─────────────────────────── */

export async function embedPage(req: Request, res: Response, fileId: string, ticket: string) {
  const send = (page: { html: string; nonce: string }, status = 200) => {
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.status(status).set(embedHeaders(page.nonce)).send(page.html);
  };
  const dest = req.get('sec-fetch-dest');
  const site = req.get('sec-fetch-site');
  if ((dest && dest !== 'iframe') || (site && site !== 'same-origin')) return send(blockedPage('Chỉ xem được trong cửa sổ đề thi của Kaned.'), 403);
  if (!readBlobTicket(ticket, fileId, 'view')) return send(blockedPage('Phiên xem đề đã hết hạn. Mở lại cửa sổ đề thi.'), 403);
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, fileId)).limit(1);
  if (!f || f.status !== 'READY') return send(blockedPage('Tệp đề không còn nữa.'), 404);
  send(await renderEmbed({ id: f.id, format: f.format, title: f.name, fileUrl: vecBlob.link(f.id, f.storageKey, { attachment: false, absolute: true }), filePublicId: null }));
}

export async function embedFile(req: Request, res: Response, fileId: string, ticket: string) {
  const dest = req.get('sec-fetch-dest');
  const site = req.get('sec-fetch-site');
  if ((dest && dest !== 'empty') || (site && site !== 'same-origin')) return res.status(403).end();
  if (!readBlobTicket(ticket, fileId, 'view')) return res.status(403).end();
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, fileId)).limit(1);
  if (!f || f.status !== 'READY' || f.format !== 'DOCX') return res.status(404).end();
  if (f.storage === 'DISK') return vecBlob.send(res, f.storageKey, f.name, false);
  const url = vecBlob.link(f.id, f.storageKey, { attachment: false });
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  const up = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!up?.ok) return res.status(502).end();
  const len = Number(up.headers.get('content-length') || 0);
  if (len > 4_000_000) {
    void up.body?.cancel();
    return res.redirect(302, url);
  }
  const buf = Buffer.from(await up.arrayBuffer());
  if (buf.length > 4_000_000) return res.redirect(302, url);
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' }).send(buf);
}

/* ─────────────────────────── the lecturer's side ─────────────────────────── */

export async function peMonitorInfo(sessionId: string) {
  const rows = await db
    .select({ attemptId: vecSubmissions.attemptId, n: sql<number>`count(*)::int`, last: sql<Date>`max(${vecSubmissions.createdAt})`, bytes: sql<number>`coalesce(sum(${vecSubmissions.bytes}), 0)::bigint` })
    .from(vecSubmissions)
    .where(eq(vecSubmissions.sessionId, sessionId))
    .groupBy(vecSubmissions.attemptId);
  return new Map(rows.map((r) => [r.attemptId, { submissions: Number(r.n), lastAt: r.last ? new Date(r.last).getTime() : null, bytes: Number(r.bytes) }]));
}

export async function grading(sessionId: string, userId: string, role: string): Promise<PeGradingDto> {
  let s = await loadHostedSession(sessionId, userId, role);
  if (s.kind !== 'PE' || !s.pe) throw ApiError.notFound('Phiên này không phải phòng thi thực hành.');
  s = await settleSession(s);
  const parts = await db.select().from(vecParticipants).where(eq(vecParticipants.sessionId, s.id));
  const atts = await db.select().from(vecAttempts).where(eq(vecAttempts.sessionId, s.id)).orderBy(asc(vecAttempts.attemptNo));
  const latest = new Map<string, VecAttemptRow>();
  for (const a of atts) latest.set(a.userId, a);
  const subs = await db.select().from(vecSubmissions).where(eq(vecSubmissions.sessionId, s.id)).orderBy(desc(vecSubmissions.no));
  const graders = [...new Set(atts.map((a) => a.gradedBy).filter(Boolean))] as string[];
  const names = graders.length ? new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, graders))).map((u) => [u.id, u.name])) : new Map<string, string>();
  const rows = parts
    .map((p) => {
      const a = latest.get(p.userId);
      if (!a) return null;
      const info = p.candidateInfo;
      return {
        attemptId: a.id,
        userId: p.userId,
        fullName: info.fullName ?? '',
        studentCode: info.studentCode ?? '',
        email: info.email ?? '',
        className: info.className ?? '',
        state: a.state,
        startedAt: ms(a.startedAt),
        closedAt: ms(a.peClosedAt) ?? ms(a.submittedAt),
        submissions: subs.filter((x) => x.attemptId === a.id).map(subDto),
        score10: a.score10,
        note: a.gradeNote,
        gradedAt: ms(a.gradedAt),
        gradedBy: a.gradedBy ? names.get(a.gradedBy) ?? null : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .sort((x, y) => x.fullName.localeCompare(y.fullName, 'vi'));
  return {
    examCode: s.pe!.examCode,
    retentionUntil: ms(s.expiresAt),
    rows,
    totals: {
      candidates: rows.length,
      submitted: rows.filter((r) => r.submissions.length).length,
      graded: rows.filter((r) => r.gradedAt != null).length,
      bytes: subs.reduce((n, x) => n + Number(x.bytes), 0),
    },
  };
}

async function hostedPeAttempt(attemptId: string, userId: string, role: string) {
  const [a] = await db.select().from(vecAttempts).where(eq(vecAttempts.id, attemptId)).limit(1);
  if (!a) throw ApiError.notFound('Không tìm thấy bài thi.');
  const s = await loadHostedSession(a.sessionId, userId, role);
  if (s.kind !== 'PE') throw ApiError.notFound('Phiên này không phải phòng thi thực hành.');
  return { attempt: a, session: s };
}

export async function gradeAttempt(attemptId: string, userId: string, role: string, body: { score10: number | null; note: string | null }) {
  const { attempt: a, session: s } = await hostedPeAttempt(attemptId, userId, role);
  if (a.state === 'LOBBY') throw ApiError.conflict('Thí sinh chưa bắt đầu làm bài.');
  const settings = s.settings as VecSettings;
  const score = body.score10;
  const note = body.note?.trim() || null;
  const cleared = score == null && !note;
  await db
    .update(vecAttempts)
    .set({
      score10: score,
      gradeLabel: score == null ? null : gradeLabel(score),
      passed: score == null ? null : score >= settings.scoring.passMark,
      gradeNote: note,
      gradedAt: cleared ? null : new Date(),
      gradedBy: cleared ? null : userId,
      version: sql`${vecAttempts.version} + 1`,
    })
    .where(eq(vecAttempts.id, a.id));
  await recomputeCounted(s.id, a.userId);
  await audit(s.id, userId, 'PE_GRADE', a.id, { score, note: Boolean(note) });
  return { ok: true, score10: score, note, gradedAt: cleared ? null : Date.now() };
}

/** Lecturer: a short-lived download address for one stored file of their room. */
export async function hostFileLink(fileId: string, userId: string, role: string) {
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, fileId)).limit(1);
  if (!f || !f.sessionId) throw ApiError.notFound('Tệp không còn nữa.');
  await loadHostedSession(f.sessionId, userId, role);
  return { url: vecBlob.link(f.id, f.storageKey, { attachment: true }), name: f.name, bytes: f.bytes };
}

/** Lecturer: a material of their own room (library or upload). */
export async function hostMaterial(sessionId: string, ref: string, userId: string, role: string) {
  const s = await loadHostedSession(sessionId, userId, role);
  const item = s.pe?.materials.find((x) => x.ref === ref) ?? s.pe?.paper.find((x) => x.ref === ref);
  if (!item) throw ApiError.notFound('Không tìm thấy tài liệu.');
  return itemLink(item);
}

/** Lecturer: the stored file of every candidate's newest submission, for "download all". */
export async function latestFiles(sessionId: string, userId: string, role: string) {
  const g = await grading(sessionId, userId, role);
  const out: Array<{ attemptId: string; studentCode: string; fullName: string; url: string; name: string; bytes: number }> = [];
  const subIds = g.rows.flatMap((r) => (r.submissions[0] ? [r.submissions[0].id] : []));
  if (!subIds.length) return out;
  const subs = await db.select({ id: vecSubmissions.id, attemptId: vecSubmissions.attemptId, fileId: vecSubmissions.fileId }).from(vecSubmissions).where(inArray(vecSubmissions.id, subIds));
  const files = await db.select().from(vecFiles).where(inArray(vecFiles.id, subs.map((x) => x.fileId!).filter(Boolean)));
  for (const r of g.rows) {
    const sub = subs.find((x) => x.attemptId === r.attemptId);
    const f = files.find((x) => x.id === sub?.fileId);
    if (!f) continue;
    out.push({ attemptId: r.attemptId, studentCode: r.studentCode, fullName: r.fullName, url: vecBlob.link(f.id, f.storageKey, { attachment: true }), name: f.name, bytes: f.bytes });
  }
  return out;
}

export async function submissionFileId(submissionId: string, userId: string, role: string) {
  const [sub] = await db.select().from(vecSubmissions).where(eq(vecSubmissions.id, submissionId)).limit(1);
  if (!sub?.fileId) throw ApiError.notFound('Bài nộp không còn nữa.');
  return hostFileLink(sub.fileId, userId, role);
}

/** The candidate's own submission (to check what they sent). */
export async function ownSubmissionLink(userId: string, attemptId: string, submissionId: string) {
  const { attempt: a } = await attemptOf(attemptId, userId);
  const [sub] = await db.select().from(vecSubmissions).where(and(eq(vecSubmissions.id, submissionId), eq(vecSubmissions.attemptId, a.id))).limit(1);
  if (!sub?.fileId) throw ApiError.notFound('Bài nộp không còn nữa.');
  const [f] = await db.select().from(vecFiles).where(eq(vecFiles.id, sub.fileId)).limit(1);
  if (!f) throw ApiError.notFound('Bài nộp không còn nữa.');
  return { url: vecBlob.link(f.id, f.storageKey, { attachment: true }), kind: 'download' as const, name: f.name };
}

export async function peCsv(s: VecSessionRow, userId: string) {
  const g = await grading(s.id, userId, 'ADMIN');
  const STATE: Record<string, string> = { LOBBY: 'Phòng chờ', IN_PROGRESS: 'Đang làm', SUSPENDED: 'Bị khóa', SUBMITTED: 'Đã đóng', AUTO_SUBMITTED: 'Hết giờ', FORCE_SUBMITTED: 'Bị thu bài', VOIDED: 'Đã hủy' };
  const header = ['STT', 'Mã SV', 'Họ và tên', 'Email', 'Lớp', 'Trạng thái', 'Số lần nộp', 'Nộp lần cuối', 'Tệp', 'Dung lượng (byte)', 'SHA-256', 'Nộp sát giờ', 'Điểm', 'Xếp loại', 'Ghi chú', 'Người chấm', 'Mã đề'];
  const rows = g.rows.map((r, i) => {
    const last = r.submissions[0];
    return [
      i + 1, r.studentCode, r.fullName, r.email, r.className, STATE[r.state] ?? r.state, r.submissions.length, last ? fmtVnFull(last.createdAt) : '', last?.fileName ?? '', last?.bytes ?? '', last?.sha256 ?? '',
      last?.late ? 'Có' : '', r.score10 ?? '', r.score10 != null ? gradeLabel(r.score10) : '', r.note ?? '', r.gradedBy ?? '', g.examCode,
    ];
  });
  await audit(s.id, userId, 'EXPORT_CSV', s.id, { rows: rows.length });
  return { name: `bang-diem-${g.examCode}.csv`, body: toCsv([header, ...rows]) };
}

/* ─────────────────────────── deleting ─────────────────────────── */

/** Removes every stored file of a room, then their rows. Returns how many files went. */
export async function purgeSessionFiles(sessionId: string): Promise<number> {
  const rows = await db.select({ id: vecFiles.id, key: vecFiles.storageKey }).from(vecFiles).where(eq(vecFiles.sessionId, sessionId));
  if (!rows.length) return 0;
  await vecBlob.destroyMany(rows.map((r) => r.key));
  await db.delete(vecSubmissions).where(eq(vecSubmissions.sessionId, sessionId));
  await db.delete(vecFiles).where(inArray(vecFiles.id, rows.map((r) => r.id)));
  return rows.length;
}

/** Drafts never attached to a room, uploads that never finished, files whose room is gone. */
export async function sweepOrphanFiles(): Promise<number> {
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const rows = await db
    .select({ id: vecFiles.id, key: vecFiles.storageKey })
    .from(vecFiles)
    .where(and(lt(vecFiles.createdAt, dayAgo), or(isNull(vecFiles.sessionId), eq(vecFiles.status, 'PENDING'))))
    .limit(500);
  if (!rows.length) return 0;
  await vecBlob.destroyMany(rows.map((r) => r.key));
  await db.delete(vecFiles).where(inArray(vecFiles.id, rows.map((r) => r.id)));
  return rows.length;
}

let lastSweep = 0;
/**
 * Without a scheduler the week-old rooms still go: any lecturer or candidate opening the
 * exam hub runs a small clean-up, at most every ten minutes per server.
 */
export async function lazySweep() {
  if (Date.now() - lastSweep < 10 * 60_000) return;
  lastSweep = Date.now();
  try {
    const due = await db.select({ id: vecSessions.id }).from(vecSessions).where(and(lt(vecSessions.expiresAt, new Date()), eq(vecSessions.kind, 'PE'))).limit(10);
    for (const { id } of due) {
      await purgeSessionFiles(id);
      await db.delete(vecSessions).where(eq(vecSessions.id, id));
    }
    await sweepOrphanFiles();
  } catch (e) {
    console.error('[vec] lazy sweep failed', e);
  }
}
