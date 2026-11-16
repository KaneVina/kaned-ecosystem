import { and, asc, count, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type {
  AcademicTermDto,
  AcademicTermInput,
  AdminFacultyDto,
  AdminMajorDto,
  AdminUniversityDto,
  FacultyInput,
  MajorInput,
  UniversityInput,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import {
  academicTerms,
  documents,
  faculties,
  majorSubjects,
  majors,
  subjects,
  universities,
  users,
  type AcademicTermRow,
} from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { toUniversity } from '../../lib/dto.js';
import { logActivity } from '../../lib/activity.js';
import { notFound, today, uniqueGuard } from './util.js';

/* ───────────────────────────── universities ───────────────────────────── */

const n = (expr: ReturnType<typeof sql>) => sql<number>`(${expr})::int`;

export async function listUniversities(): Promise<AdminUniversityDto[]> {
  const rows = await db
    .select({
      ...getTableColumns(universities),
      facultyCount: n(sql`select count(*) from ${faculties} f where f.university_id = ${universities.id}`),
      majorCount: n(
        sql`select count(*) from ${majors} m join ${faculties} f on f.id = m.faculty_id where f.university_id = ${universities.id}`,
      ),
      subjectCount: n(sql`select count(*) from ${subjects} s where s.university_id = ${universities.id}`),
      termCount: n(sql`select count(*) from ${academicTerms} t where t.university_id = ${universities.id}`),
      userCount: n(sql`select count(*) from ${users} u where u.university_id = ${universities.id}`),
      documentCount: n(sql`select count(*) from ${documents} d where d.university_id = ${universities.id}`),
    })
    .from(universities)
    .orderBy(asc(universities.name));

  return rows.map((r) => ({
    ...toUniversity(r, r.documentCount),
    facultyCount: r.facultyCount,
    majorCount: r.majorCount,
    subjectCount: r.subjectCount,
    termCount: r.termCount,
    userCount: r.userCount,
    documentCount: r.documentCount,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function universityById(id: string) {
  const all = await listUniversities();
  return all.find((u) => u.id === id) ?? notFound('trường');
}

export async function getUniversity(id: string) {
  return universityById(id);
}

export async function createUniversity(actorId: string, input: UniversityInput) {
  const [row] = await uniqueGuard(
    db.insert(universities).values(input).returning({ id: universities.id }),
    'code',
    `Mã trường ${input.code} đã có.`,
  );
  await logActivity(actorId, 'create', 'university', row.id, `Thêm trường ${input.code} — ${input.nameVi}`);
  return universityById(row.id);
}

export async function updateUniversity(actorId: string, id: string, input: Partial<UniversityInput>) {
  const existing = await db.query.universities.findFirst({ where: eq(universities.id, id) });
  if (!existing) notFound('trường');
  await uniqueGuard(
    db.update(universities).set(input).where(eq(universities.id, id)),
    'code',
    `Mã trường ${input.code} đã có.`,
  );
  await logActivity(actorId, 'update', 'university', id, `Sửa thông tin trường ${input.code ?? existing.code}`);
  return universityById(id);
}

export async function deleteUniversity(actorId: string, id: string) {
  const u = await universityById(id);
  if (u.documentCount > 0) {
    throw ApiError.conflict(
      `${u.code} còn ${u.documentCount} tài liệu. Xoá hoặc chuyển các tài liệu đó trước khi xoá trường.`,
    );
  }
  await db.delete(universities).where(eq(universities.id, id));
  await logActivity(actorId, 'delete', 'university', id, `Xoá trường ${u.code} — ${u.nameVi}`);
}

/* ─────────────────────────────── majors ──────────────────────────────── */

async function majorRows(where: ReturnType<typeof eq> | undefined): Promise<AdminMajorDto[]> {
  const rows = await db
    .select({
      ...getTableColumns(majors),
      facultyName: faculties.name,
      facultyNameVi: faculties.nameVi,
      universityId: faculties.universityId,
      subjectCount: n(sql`select count(*) from ${majorSubjects} ms where ms.major_id = ${majors.id}`),
      plannedCredits: n(
        sql`select coalesce(sum(s.credits), 0) from ${majorSubjects} ms join ${subjects} s on s.id = ms.subject_id where ms.major_id = ${majors.id} and ms.is_required`,
      ),
      studentCount: n(sql`select count(*) from ${users} u where u.major_id = ${majors.id}`),
    })
    .from(majors)
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(where)
    .orderBy(asc(majors.code));

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    nameVi: r.nameVi,
    facultyId: r.facultyId,
    faculty: { id: r.facultyId, name: r.facultyName, nameVi: r.facultyNameVi, universityId: r.universityId },
    totalCredits: r.totalCredits,
    passMark: r.passMark,
    termCount: r.termCount,
    subjectCount: r.subjectCount,
    plannedCredits: r.plannedCredits,
    studentCount: r.studentCount,
  }));
}

export async function getMajor(id: string) {
  const [row] = await majorRows(eq(majors.id, id));
  return row ?? notFound('ngành');
}

export async function listMajors(universityId?: string) {
  return majorRows(universityId ? eq(faculties.universityId, universityId) : undefined);
}

export async function createMajor(actorId: string, input: MajorInput) {
  const faculty = await db.query.faculties.findFirst({ where: eq(faculties.id, input.facultyId) });
  if (!faculty) throw ApiError.badRequest('Khoa không tồn tại.', { facultyId: 'Chọn lại khoa.' });
  const [row] = await uniqueGuard(
    db.insert(majors).values(input).returning({ id: majors.id }),
    'code',
    `Khoa ${faculty.code} đã có ngành mã ${input.code}.`,
  );
  await logActivity(actorId, 'create', 'major', row.id, `Thêm ngành ${input.code} — ${input.nameVi}`);
  return getMajor(row.id);
}

export async function updateMajor(actorId: string, id: string, input: Partial<MajorInput>) {
  const major = await getMajor(id);
  if (input.termCount !== undefined) {
    const [used] = await db
      .select({ max: sql<number | null>`max(${majorSubjects.termNo})` })
      .from(majorSubjects)
      .where(eq(majorSubjects.majorId, id));
    if (used?.max && input.termCount < used.max) {
      throw ApiError.badRequest(`Kỳ ${used.max} vẫn còn môn. Chuyển các môn đó sang kỳ khác trước khi bớt kỳ.`, {
        termCount: `Ít nhất ${used.max} kỳ.`,
      });
    }
  }
  await uniqueGuard(
    db.update(majors).set(input).where(eq(majors.id, id)),
    'code',
    `Khoa này đã có ngành mã ${input.code}.`,
  );
  await logActivity(actorId, 'update', 'major', id, `Sửa ngành ${input.code ?? major.code}`);
  return getMajor(id);
}

export async function deleteMajor(actorId: string, id: string) {
  const major = await getMajor(id);
  await db.delete(majors).where(eq(majors.id, id));
  await logActivity(
    actorId,
    'delete',
    'major',
    id,
    `Xoá ngành ${major.code} — ${major.nameVi}${major.studentCount ? ` (${major.studentCount} sinh viên bỏ chọn ngành)` : ''}`,
  );
}

/* ─────────────────────────────── faculties ────────────────────────────── */

export async function listFaculties(universityId: string): Promise<AdminFacultyDto[]> {
  const [rows, majorList, subjectCounts] = await Promise.all([
    db.query.faculties.findMany({ where: eq(faculties.universityId, universityId), orderBy: asc(faculties.code) }),
    listMajors(universityId),
    db
      .select({ facultyId: subjects.facultyId, value: count() })
      .from(subjects)
      .where(eq(subjects.universityId, universityId))
      .groupBy(subjects.facultyId),
  ]);
  const subjectsBy = new Map(subjectCounts.map((r) => [r.facultyId, r.value]));
  return rows.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    nameVi: f.nameVi,
    universityId: f.universityId,
    subjectCount: subjectsBy.get(f.id) ?? 0,
    majors: majorList.filter((m) => m.facultyId === f.id),
  }));
}

export async function createFaculty(actorId: string, input: FacultyInput) {
  const university = await db.query.universities.findFirst({ where: eq(universities.id, input.universityId) });
  if (!university) throw ApiError.badRequest('Trường không tồn tại.', { universityId: 'Chọn lại trường.' });
  const [row] = await uniqueGuard(
    db.insert(faculties).values(input).returning({ id: faculties.id }),
    'code',
    `${university.code} đã có khoa mã ${input.code}.`,
  );
  await logActivity(actorId, 'create', 'faculty', row.id, `Thêm khoa ${input.code} — ${input.nameVi} (${university.code})`);
  return (await listFaculties(input.universityId)).find((f) => f.id === row.id)!;
}

export async function updateFaculty(actorId: string, id: string, input: Partial<Omit<FacultyInput, 'universityId'>>) {
  const faculty = await db.query.faculties.findFirst({ where: eq(faculties.id, id) });
  if (!faculty) notFound('khoa');
  await uniqueGuard(
    db.update(faculties).set(input).where(eq(faculties.id, id)),
    'code',
    `Trường này đã có khoa mã ${input.code}.`,
  );
  await logActivity(actorId, 'update', 'faculty', id, `Sửa khoa ${input.code ?? faculty.code}`);
  return (await listFaculties(faculty.universityId)).find((f) => f.id === id)!;
}

export async function deleteFaculty(actorId: string, id: string) {
  const faculty = await db.query.faculties.findFirst({ where: eq(faculties.id, id) });
  if (!faculty) notFound('khoa');
  const [m] = await db.select({ value: count() }).from(majors).where(eq(majors.facultyId, id));
  if (m && m.value > 0) {
    throw ApiError.conflict(`Khoa ${faculty.code} còn ${m.value} ngành. Xoá hoặc chuyển các ngành đó trước.`);
  }
  await db.delete(faculties).where(eq(faculties.id, id));
  await logActivity(actorId, 'delete', 'faculty', id, `Xoá khoa ${faculty.code} — ${faculty.nameVi}`);
}

/* ───────────────────────────── academic terms ─────────────────────────── */

export function termState(row: Pick<AcademicTermRow, 'startsOn' | 'endsOn'>, on = today()): AcademicTermDto['state'] {
  if (!row.startsOn || !row.endsOn) return 'undated';
  if (on < row.startsOn) return 'upcoming';
  if (on > row.endsOn) return 'past';
  return 'current';
}

export function toTerm(row: AcademicTermRow, documentCount?: number): AcademicTermDto {
  return {
    id: row.id,
    universityId: row.universityId,
    code: row.code,
    name: row.name,
    schoolYear: row.schoolYear,
    semester: row.semester,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    state: termState(row),
    documentCount,
  };
}

const SEMESTER_ORDER = { S1: 0, S2: 1, SUMMER: 2 } as const;

/** Newest school year first, and within a year the order the semesters run. */
export async function listTerms(universityId: string): Promise<AcademicTermDto[]> {
  const rows = await db.query.academicTerms.findMany({ where: eq(academicTerms.universityId, universityId) });
  const counts = rows.length
    ? await db
        .select({ termId: documents.academicTermId, value: count() })
        .from(documents)
        .where(inArray(documents.academicTermId, rows.map((r) => r.id)))
        .groupBy(documents.academicTermId)
    : [];
  const by = new Map(counts.map((c) => [c.termId, c.value]));
  return rows
    .sort(
      (a, b) =>
        b.schoolYear.localeCompare(a.schoolYear) ||
        SEMESTER_ORDER[b.semester] - SEMESTER_ORDER[a.semester] ||
        a.code.localeCompare(b.code),
    )
    .map((r) => toTerm(r, by.get(r.id) ?? 0));
}

function assertDates(startsOn: string | null | undefined, endsOn: string | null | undefined) {
  if (startsOn && endsOn && endsOn < startsOn) {
    throw ApiError.badRequest('Ngày kết thúc phải sau ngày bắt đầu.', { endsOn: 'Phải sau ngày bắt đầu.' });
  }
}

export async function createTerm(actorId: string, input: AcademicTermInput) {
  assertDates(input.startsOn, input.endsOn);
  const [row] = await uniqueGuard(
    db.insert(academicTerms).values(input).returning(),
    'code',
    `Trường này đã có kỳ mã ${input.code}.`,
  );
  await logActivity(actorId, 'create', 'term', row.id, `Thêm kỳ ${input.name} (${input.code})`);
  return toTerm(row, 0);
}

export async function updateTerm(actorId: string, id: string, input: Partial<Omit<AcademicTermInput, 'universityId'>>) {
  const term = await db.query.academicTerms.findFirst({ where: eq(academicTerms.id, id) });
  if (!term) notFound('kỳ học');
  assertDates(input.startsOn !== undefined ? input.startsOn : term.startsOn, input.endsOn !== undefined ? input.endsOn : term.endsOn);
  const [row] = await uniqueGuard(
    db.update(academicTerms).set(input).where(eq(academicTerms.id, id)).returning(),
    'code',
    `Trường này đã có kỳ mã ${input.code}.`,
  );
  // Documents filed under the term follow its semester and school year.
  if (input.semester || input.schoolYear) {
    await db
      .update(documents)
      .set({ semester: row.semester, schoolYear: row.schoolYear })
      .where(eq(documents.academicTermId, id));
  }
  await logActivity(actorId, 'update', 'term', id, `Sửa kỳ ${row.name} (${row.code})`);
  return toTerm(row);
}

export async function deleteTerm(actorId: string, id: string) {
  const term = await db.query.academicTerms.findFirst({ where: eq(academicTerms.id, id) });
  if (!term) notFound('kỳ học');
  await db.delete(academicTerms).where(and(eq(academicTerms.id, id)));
  await logActivity(actorId, 'delete', 'term', id, `Xoá kỳ ${term.name} (${term.code})`);
}
