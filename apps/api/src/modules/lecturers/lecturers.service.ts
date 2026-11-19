import { and, asc, count, desc, eq, ilike, inArray, isNotNull, type SQL } from 'drizzle-orm';
import {
  foldVi,
  lecturerLinkKind,
  type DocumentSummaryDto,
  type LecturerDetailDto,
  type LecturerDto,
  type LecturerGender,
  type LecturerImportResult,
  type LecturerInput,
  type LecturerUpdate,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { documents, lecturers, subjects, universities } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { logActivity } from '../../lib/activity.js';
import { documentWith, toDocumentSummary } from '../../lib/dto.js';

type Row = typeof lecturers.$inferSelect & { university: { id: string; code: string; nameVi: string; color: string } };

/** What a search matches: name, code, department and email, without accents. */
const searchText = (l: { fullName: string; code: string; department?: string | null; email?: string | null }) =>
  foldVi([l.fullName, l.code, l.department ?? '', l.email ?? ''].join(' '));

/** Links as stored: trimmed, no duplicates, at most 10. */
const cleanLinks = (links?: Array<{ label?: string | null; url: string }> | null) => {
  const seen = new Set<string>();
  return (links ?? [])
    .map((l) => ({ label: l.label?.trim() || null, url: l.url.trim() }))
    .filter((l) => l.url && !seen.has(l.url) && seen.add(l.url))
    .slice(0, 10);
};

const toDto = (r: Row, documentCount: number): LecturerDto => ({
  id: r.id,
  code: r.code,
  fullName: r.fullName,
  department: r.department,
  gender: (r.gender as LecturerGender | null) ?? null,
  phone: r.phone,
  email: r.email,
  description: r.description,
  links: (r.links ?? []).map((l) => ({ label: l.label ?? null, url: l.url, kind: lecturerLinkKind(l.url) })),
  university: { id: r.university.id, code: r.university.code, nameVi: r.university.nameVi, color: r.university.color },
  documentCount,
});

const withUniversity = { university: { columns: { id: true, code: true, nameVi: true, color: true } } } as const;

async function documentCounts(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ id: documents.lecturerId, n: count() })
    .from(documents)
    .where(and(inArray(documents.lecturerId, ids), eq(documents.status, 'PUBLISHED')))
    .groupBy(documents.lecturerId);
  return new Map(rows.map((r) => [r.id!, r.n]));
}

export async function listLecturers(q: { q?: string; universityId?: string; department?: string; page: number; pageSize: number }) {
  const where: SQL[] = [];
  if (q.universityId) where.push(eq(lecturers.universityId, q.universityId));
  if (q.department) where.push(eq(lecturers.department, q.department));
  // Every word must appear somewhere: "hoang nt" finds Nguyễn Thị Hoàng (HoangNT).
  for (const word of foldVi(q.q ?? '').split(/\s+/).filter(Boolean).slice(0, 6)) {
    where.push(ilike(lecturers.search, `%${word.replace(/[%_\\]/g, '\\$&')}%`));
  }
  const cond = where.length ? and(...where) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(lecturers).where(cond);
  const rows = await db.query.lecturers.findMany({
    where: cond,
    with: withUniversity,
    orderBy: [asc(lecturers.fullName)],
    limit: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
  });
  const counts = await documentCounts(rows.map((r) => r.id));
  return {
    items: rows.map((r) => toDto(r as Row, counts.get(r.id) ?? 0)),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

/** Departments (bộ môn) that have lecturers, for the filter. */
export async function listDepartments(universityId?: string) {
  const rows = await db
    .selectDistinct({ department: lecturers.department })
    .from(lecturers)
    .where(and(isNotNull(lecturers.department), universityId ? eq(lecturers.universityId, universityId) : undefined))
    .orderBy(asc(lecturers.department));
  return rows.map((r) => r.department!).filter(Boolean);
}

async function findRow(id: string) {
  const row = await db.query.lecturers.findFirst({ where: eq(lecturers.id, id), with: withUniversity });
  if (!row) throw ApiError.notFound('Không tìm thấy giảng viên này.');
  return row as Row;
}

export async function getLecturer(id: string, viewerId?: string): Promise<LecturerDetailDto> {
  const row = await findRow(id);
  const published = and(eq(documents.lecturerId, id), eq(documents.status, 'PUBLISHED'));
  const [docs, bySubject, [{ n }]] = await Promise.all([
    db.query.documents.findMany({
      where: viewerId ? published : and(published, eq(documents.internal, false)),
      with: documentWith,
      orderBy: [desc(documents.createdAt)],
      limit: 12,
    }),
    db
      .select({ id: subjects.id, code: subjects.code, nameVi: subjects.nameVi, count: count() })
      .from(documents)
      .innerJoin(subjects, eq(subjects.id, documents.subjectId))
      .where(published)
      .groupBy(subjects.id, subjects.code, subjects.nameVi)
      .orderBy(desc(count()))
      .limit(12),
    db.select({ n: count() }).from(documents).where(published),
  ]);
  return {
    ...toDto(row, n),
    subjects: bySubject,
    documents: docs.map((d) => toDocumentSummary(d as Parameters<typeof toDocumentSummary>[0])) as DocumentSummaryDto[],
  };
}

/* ─────────────────────────────── admin ─────────────────────────────── */

async function assertUniversity(id: string) {
  const u = await db.query.universities.findFirst({ where: eq(universities.id, id), columns: { id: true } });
  if (!u) throw ApiError.badRequest('Trường không tồn tại.', { universityId: 'Chọn trường.' });
}

const duplicate = (code: string) => ApiError.conflict(`Mã ${code} đã có ở trường này.`, { code: 'Mã này đã được dùng.' });

export async function createLecturer(actorId: string, input: LecturerInput & { universityId: string }) {
  await assertUniversity(input.universityId);
  const values = {
    universityId: input.universityId,
    code: input.code.trim(),
    fullName: input.fullName.trim(),
    department: input.department ?? null,
    gender: input.gender ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    description: input.description ?? null,
    links: cleanLinks(input.links),
  };
  const [created] = await db
    .insert(lecturers)
    .values({ ...values, search: searchText(values) })
    .onConflictDoNothing()
    .returning({ id: lecturers.id });
  if (!created) throw duplicate(values.code);
  await logActivity(actorId, 'create', 'lecturer', created.id, `Thêm giảng viên ${values.fullName} (${values.code})`);
  return getLecturer(created.id, actorId);
}

export async function updateLecturer(actorId: string, id: string, input: LecturerUpdate) {
  const before = await findRow(id);
  if (input.universityId) await assertUniversity(input.universityId);
  const next = { ...before, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as typeof before;
  try {
    await db
      .update(lecturers)
      .set({
        universityId: next.universityId,
        code: next.code,
        fullName: next.fullName,
        department: next.department,
        gender: next.gender,
        phone: next.phone,
        email: next.email,
        description: next.description,
        links: cleanLinks(next.links),
        search: searchText(next),
        updatedAt: new Date(),
      })
      .where(eq(lecturers.id, id));
  } catch (e) {
    if (String((e as { code?: string }).code) === '23505') throw duplicate(next.code);
    throw e;
  }
  // Documents linked to the lecturer show the current name.
  if (next.fullName !== before.fullName) {
    await db.update(documents).set({ lecturer: next.fullName.slice(0, 120) }).where(eq(documents.lecturerId, id));
  }
  await logActivity(actorId, 'update', 'lecturer', id, `Sửa giảng viên ${next.fullName} (${next.code})`);
  return getLecturer(id, actorId);
}

export async function deleteLecturer(actorId: string, id: string) {
  const row = await findRow(id);
  // Linked documents keep the name as plain text.
  await db.delete(lecturers).where(eq(lecturers.id, id));
  await logActivity(actorId, 'delete', 'lecturer', id, `Xoá giảng viên ${row.fullName} (${row.code})`);
}

export async function importLecturers(
  actorId: string,
  input: { universityId: string; onExisting: 'update' | 'skip'; rows: Array<Omit<LecturerInput, 'universityId'>> },
): Promise<LecturerImportResult> {
  await assertUniversity(input.universityId);
  // Last row wins when a code appears twice in the sheet.
  const byCode = new Map(input.rows.map((r) => [r.code.trim().toLowerCase(), r]));
  const existing = await db
    .select({ id: lecturers.id, code: lecturers.code })
    .from(lecturers)
    .where(eq(lecturers.universityId, input.universityId));
  const known = new Map(existing.map((e) => [e.code.toLowerCase(), e.id]));
  const result: LecturerImportResult = { created: 0, updated: 0, skipped: 0 };
  await db.transaction(async (tx) => {
    for (const [key, r] of byCode) {
      const values = {
        code: r.code.trim(),
        fullName: r.fullName.trim(),
        department: r.department ?? null,
        gender: r.gender ?? null,
        phone: r.phone ?? null,
        email: r.email ?? null,
        description: r.description ?? null,
        links: cleanLinks(r.links),
      };
      const id = known.get(key);
      if (id) {
        if (input.onExisting === 'skip') {
          result.skipped++;
          continue;
        }
        await tx.update(lecturers).set({ ...values, search: searchText(values), updatedAt: new Date() }).where(eq(lecturers.id, id));
        await tx.update(documents).set({ lecturer: values.fullName.slice(0, 120) }).where(eq(documents.lecturerId, id));
        result.updated++;
      } else {
        await tx.insert(lecturers).values({ ...values, universityId: input.universityId, search: searchText(values) });
        result.created++;
      }
    }
  });
  await logActivity(
    actorId,
    'create',
    'lecturer',
    null,
    `Nhập giảng viên: ${result.created} mới, ${result.updated} cập nhật, ${result.skipped} bỏ qua`,
  );
  return result;
}

/** The lecturer a document points at, checked to exist; its name becomes the document's lecturer text. */
export async function lecturerForDocument(lecturerId: string | null | undefined) {
  if (!lecturerId) return null;
  const row = await db.query.lecturers.findFirst({ where: eq(lecturers.id, lecturerId), columns: { id: true, fullName: true } });
  if (!row) throw ApiError.badRequest('Giảng viên đã chọn không còn trong danh bạ.', { lecturer: 'Chọn lại giảng viên.' });
  return row;
}

