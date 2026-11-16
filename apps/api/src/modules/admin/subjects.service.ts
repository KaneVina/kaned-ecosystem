import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type {
  AdminSubjectDto,
  CurriculumAddInput,
  CurriculumEntryInput,
  Paginated,
  SubjectInput,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { documents, faculties, majorSubjects, majors, subjects, type SubjectRow } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { toSubjectSummary } from '../../lib/dto.js';
import { logActivity } from '../../lib/activity.js';
import { rebuildPrerequisiteEdges, renameCodeInRules } from '../../lib/curriculum.js';
import { foldVietnamese } from '../../lib/slug.js';
import { getCurriculum } from '../catalog/catalog.service.js';
import { getMajor } from './institutions.service.js';
import { notFound, uniqueGuard } from './util.js';

/* ─────────────────────────────── subjects ──────────────────────────────── */

async function decorate(rows: Array<SubjectRow & { university: { id: string; code: string; name: string; nameVi: string; color: string } }>) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [docCounts, programmes, facultyRows] = await Promise.all([
    db
      .select({ subjectId: documents.subjectId, value: count() })
      .from(documents)
      .where(inArray(documents.subjectId, ids))
      .groupBy(documents.subjectId),
    db
      .select({
        subjectId: majorSubjects.subjectId,
        majorId: majors.id,
        majorCode: majors.code,
        majorName: majors.nameVi,
        termNo: majorSubjects.termNo,
      })
      .from(majorSubjects)
      .innerJoin(majors, eq(majors.id, majorSubjects.majorId))
      .where(inArray(majorSubjects.subjectId, ids)),
    db.query.faculties.findMany({
      where: inArray(faculties.id, rows.map((r) => r.facultyId).filter((x): x is string => Boolean(x))),
    }),
  ]);
  const docs = new Map(docCounts.map((d) => [d.subjectId, d.value]));
  const facultyBy = new Map(facultyRows.map((f) => [f.id, f]));

  return rows.map<AdminSubjectDto>((r) => {
    const faculty = r.facultyId ? facultyBy.get(r.facultyId) : undefined;
    return {
      ...toSubjectSummary(r, docs.get(r.id) ?? 0),
      facultyId: r.facultyId,
      faculty: faculty ? { id: faculty.id, code: faculty.code, nameVi: faculty.nameVi } : null,
      description: r.description,
      assessment: r.assessment,
      topics: r.topics,
      outcomes: r.outcomes,
      documentCount: docs.get(r.id) ?? 0,
      programmes: programmes
        .filter((p) => p.subjectId === r.id)
        .map(({ majorId, majorCode, majorName, termNo }) => ({ majorId, majorCode, majorName, termNo })),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

export async function listSubjects(query: {
  q?: string;
  universityId?: string;
  facultyId?: string;
  page: number;
  pageSize: number;
}): Promise<Paginated<AdminSubjectDto>> {
  const filters: SQL[] = [];
  if (query.universityId) filters.push(eq(subjects.universityId, query.universityId));
  if (query.facultyId) filters.push(eq(subjects.facultyId, query.facultyId));
  if (query.q) {
    const q = `%${query.q.trim()}%`;
    const folded = `%${foldVietnamese(query.q)}%`;
    const match = or(ilike(subjects.code, q), ilike(subjects.name, q), ilike(subjects.nameVi, q), ilike(subjects.name, folded));
    if (match) filters.push(match);
  }
  const where = filters.length ? and(...filters) : undefined;
  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(subjects).where(where),
    db.query.subjects.findMany({
      where,
      with: { university: true },
      orderBy: [asc(subjects.code)],
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  ]);
  return {
    items: await decorate(rows),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.value ?? 0,
    totalPages: Math.max(1, Math.ceil((total?.value ?? 0) / query.pageSize)),
  };
}

export async function getSubject(id: string) {
  const row = await db.query.subjects.findFirst({ where: eq(subjects.id, id), with: { university: true } });
  if (!row) notFound('môn học');
  const [dto] = await decorate([row]);
  return dto;
}

async function assertFaculty(facultyId: string | null | undefined, universityId: string) {
  if (!facultyId) return;
  const faculty = await db.query.faculties.findFirst({ where: eq(faculties.id, facultyId) });
  if (!faculty || faculty.universityId !== universityId) {
    throw ApiError.badRequest('Khoa không thuộc trường của môn.', { facultyId: 'Chọn khoa của trường này.' });
  }
}

export async function createSubject(actorId: string, input: SubjectInput) {
  await assertFaculty(input.facultyId, input.universityId);
  const [row] = await uniqueGuard(
    db.insert(subjects).values(input).returning({ id: subjects.id }),
    'code',
    `Trường này đã có môn mã ${input.code}.`,
  );
  await logActivity(actorId, 'create', 'subject', row.id, `Thêm môn ${input.code} — ${input.nameVi}`);
  return getSubject(row.id);
}

export async function updateSubject(actorId: string, id: string, input: Partial<Omit<SubjectInput, 'universityId'>>) {
  const existing = await db.query.subjects.findFirst({ where: eq(subjects.id, id) });
  if (!existing) notFound('môn học');
  await assertFaculty(input.facultyId, existing.universityId);

  await uniqueGuard(
    db.update(subjects).set(input).where(eq(subjects.id, id)),
    'code',
    `Trường này đã có môn mã ${input.code}.`,
  );

  let note = '';
  if (input.code && input.code !== existing.code) {
    // Rules elsewhere mention the old code; keep them pointing at this subject.
    const touched = await renameCodeInRules(existing.universityId, existing.code, input.code);
    await rebuildPrerequisiteEdges(touched);
    note = ` (đổi mã từ ${existing.code}${touched.length ? `, cập nhật điều kiện của ${touched.length} môn` : ''})`;
  }
  await logActivity(actorId, 'update', 'subject', id, `Sửa môn ${input.code ?? existing.code}${note}`);
  return getSubject(id);
}

export async function deleteSubject(actorId: string, id: string) {
  const dto = await getSubject(id);
  if (dto.documentCount > 0) {
    throw ApiError.conflict(`${dto.code} còn ${dto.documentCount} tài liệu. Chuyển các tài liệu sang môn khác trước khi xoá.`);
  }
  await db.delete(subjects).where(eq(subjects.id, id));
  await logActivity(actorId, 'delete', 'subject', id, `Xoá môn ${dto.code} — ${dto.nameVi}`);
}

/* ────────────────────────────── curriculum ─────────────────────────────── */

async function majorContext(majorId: string) {
  const major = await getMajor(majorId);
  const universityId = major.faculty!.universityId;
  return { major, universityId };
}

function assertTerm(termNo: number | null | undefined, termCount: number) {
  if (termNo && termNo > termCount) {
    throw ApiError.badRequest(`Chương trình chỉ có ${termCount} kỳ. Thêm kỳ trước, rồi xếp môn vào.`, {
      termNo: `Từ 1 đến ${termCount}.`,
    });
  }
}

export async function addToCurriculum(actorId: string, majorId: string, input: CurriculumAddInput) {
  const { major, universityId } = await majorContext(majorId);
  assertTerm(input.termNo, major.termCount);
  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, input.subjectId) });
  if (!subject || subject.universityId !== universityId) {
    throw ApiError.badRequest('Môn này không thuộc trường của ngành.', { subjectId: 'Chọn môn của trường này.' });
  }
  const { subjectId, ...entry } = input;
  await uniqueGuard(
    db.insert(majorSubjects).values({ majorId, subjectId, ...entry }),
    'subjectId',
    `${subject.code} đã có trong chương trình.`,
  );
  await rebuildPrerequisiteEdges([subjectId]);
  await logActivity(
    actorId,
    'create',
    'curriculum',
    majorId,
    `Thêm ${subject.code} vào ${major.code}${input.termNo ? `, kỳ ${input.termNo}` : ''}`,
  );
  return getCurriculum(majorId);
}

export async function updateCurriculumEntry(
  actorId: string,
  majorId: string,
  subjectId: string,
  input: Partial<CurriculumEntryInput>,
) {
  const { major } = await majorContext(majorId);
  assertTerm(input.termNo, major.termCount);
  const row = await db.query.majorSubjects.findFirst({
    where: and(eq(majorSubjects.majorId, majorId), eq(majorSubjects.subjectId, subjectId)),
    with: { subject: true },
  });
  if (!row) notFound('môn trong chương trình');

  await db
    .update(majorSubjects)
    .set(input)
    .where(and(eq(majorSubjects.majorId, majorId), eq(majorSubjects.subjectId, subjectId)));
  if (input.requirements) await rebuildPrerequisiteEdges([subjectId]);

  const onlyMove = input.termNo !== undefined && Object.keys(input).length === 1;
  await logActivity(
    actorId,
    onlyMove ? 'move' : 'update',
    'curriculum',
    majorId,
    onlyMove
      ? `Chuyển ${row.subject.code} (${major.code}) từ kỳ ${row.termNo ?? '—'} sang kỳ ${input.termNo ?? '—'}`
      : `Sửa ${row.subject.code} trong ${major.code}${input.requirements ? ` — ${input.requirements.length} điều kiện` : ''}`,
  );
  return getCurriculum(majorId);
}

export async function removeFromCurriculum(actorId: string, majorId: string, subjectId: string) {
  const { major } = await majorContext(majorId);
  const row = await db.query.majorSubjects.findFirst({
    where: and(eq(majorSubjects.majorId, majorId), eq(majorSubjects.subjectId, subjectId)),
    with: { subject: true },
  });
  if (!row) notFound('môn trong chương trình');
  await db.delete(majorSubjects).where(and(eq(majorSubjects.majorId, majorId), eq(majorSubjects.subjectId, subjectId)));
  await rebuildPrerequisiteEdges([subjectId]);
  await logActivity(actorId, 'delete', 'curriculum', majorId, `Bỏ ${row.subject.code} khỏi ${major.code}`);
  return getCurriculum(majorId);
}

/** Subjects of the major's university that are not in its curriculum yet. */
export async function curriculumCandidates(majorId: string, q?: string) {
  const { universityId } = await majorContext(majorId);
  const filters: SQL[] = [
    eq(subjects.universityId, universityId),
    sql`not exists (select 1 from ${majorSubjects} ms where ms.subject_id = ${subjects.id} and ms.major_id = ${majorId})`,
  ];
  if (q) {
    const match = or(ilike(subjects.code, `%${q}%`), ilike(subjects.nameVi, `%${q}%`), ilike(subjects.name, `%${q}%`));
    if (match) filters.push(match);
  }
  const rows = await db.query.subjects.findMany({ where: and(...filters), orderBy: asc(subjects.code), limit: 30 });
  return rows.map((r) => toSubjectSummary(r));
}
