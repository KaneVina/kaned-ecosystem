import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type {
  CurriculumDto,
  CurriculumSubjectDto,
  Paginated,
  SubjectDetailDto,
  SubjectQuery,
  SubjectSummaryDto,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import {
  documents,
  faculties,
  majorSubjects,
  majors,
  subjectPrerequisites,
  subjects,
  universities,
} from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import {
  documentWith,
  subjectWith,
  toDocumentSummary,
  toMajor,
  toSubjectSummary,
  toUniversity,
} from '../../lib/dto.js';
import { foldVietnamese } from '../../lib/slug.js';

export async function listUniversities() {
  const rows = await db.query.universities.findMany({ orderBy: asc(universities.name) });

  const counts = await db
    .select({ universityId: documents.universityId, value: count() })
    .from(documents)
    .where(eq(documents.status, 'PUBLISHED'))
    .groupBy(documents.universityId);

  const byId = new Map(counts.map((c) => [c.universityId, c.value]));
  return rows
    .map((row) => toUniversity(row, byId.get(row.id) ?? 0))
    .sort((a, b) => (b.documentCount ?? 0) - (a.documentCount ?? 0) || a.name.localeCompare(b.name));
}

export async function listFaculties(universityId?: string) {
  const rows = await db.query.faculties.findMany({
    where: universityId ? eq(faculties.universityId, universityId) : undefined,
    orderBy: asc(faculties.name),
    with: {
      university: true,
      majors: { orderBy: asc(majors.name) },
    },
  });

  return rows.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    nameVi: f.nameVi,
    universityId: f.universityId,
    university: f.university
      ? {
          id: f.university.id,
          code: f.university.code,
          name: f.university.name,
          color: f.university.color,
        }
      : undefined,
    majors: f.majors.map((m) => toMajor(m)),
  }));
}

export async function listMajors(params: { universityId?: string; facultyId?: string }) {
  const rows = await db.query.majors.findMany({
    orderBy: asc(majors.name),
    with: { faculty: true },
    where: params.facultyId ? eq(majors.facultyId, params.facultyId) : undefined,
  });

  const filtered = params.universityId
    ? rows.filter((m) => m.faculty?.universityId === params.universityId)
    : rows;

  const counts = await db
    .select({ majorId: majorSubjects.majorId, value: count() })
    .from(majorSubjects)
    .groupBy(majorSubjects.majorId);
  const byId = new Map(counts.map((c) => [c.majorId, c.value]));

  return filtered.map((m) => toMajor(m, byId.get(m.id) ?? 0));
}

export async function searchSubjects(query: SubjectQuery): Promise<Paginated<SubjectSummaryDto>> {
  const filters: SQL[] = [];

  if (query.universityId) filters.push(eq(subjects.universityId, query.universityId));
  if (query.facultyId) filters.push(eq(subjects.facultyId, query.facultyId));
  if (query.year) filters.push(eq(subjects.typicalYear, query.year));
  if (query.majorId) {
    filters.push(
      sql`exists (select 1 from ${majorSubjects} ms where ms.subject_id = ${subjects.id} and ms.major_id = ${query.majorId})`,
    );
  }
  if (query.q) {
    const q = `%${query.q.trim()}%`;
    const folded = `%${foldVietnamese(query.q)}%`;
    const match = or(
      ilike(subjects.code, folded),
      ilike(subjects.name, q),
      ilike(subjects.name, folded),
      ilike(subjects.nameVi, q),
    );
    if (match) filters.push(match);
  }

  const where = filters.length ? and(...filters) : undefined;

  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(subjects).where(where),
    db.query.subjects.findMany({
      where,
      with: subjectWith,
      orderBy: [asc(subjects.typicalYear), asc(subjects.code)],
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  ]);

  const ids = rows.map((r) => r.id);
  const [documentCounts, prereqCounts] = await Promise.all([
    documentCountsFor(ids),
    prerequisiteCountsFor(ids),
  ]);

  return {
    items: rows.map((row) =>
      toSubjectSummary(row, documentCounts.get(row.id) ?? 0, prereqCounts.get(row.id) ?? 0),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.value ?? 0,
    totalPages: Math.max(1, Math.ceil((total?.value ?? 0) / query.pageSize)),
  };
}

/** One grouped query instead of a prerequisites join on every listed subject. */
async function prerequisiteCountsFor(subjectIds: string[]) {
  if (!subjectIds.length) return new Map<string, number>();
  const rows = await db
    .select({ subjectId: subjectPrerequisites.subjectId, value: count() })
    .from(subjectPrerequisites)
    .where(inArray(subjectPrerequisites.subjectId, subjectIds))
    .groupBy(subjectPrerequisites.subjectId);
  return new Map(rows.map((row) => [row.subjectId, row.value]));
}

async function documentCountsFor(subjectIds: string[]) {
  if (!subjectIds.length) return new Map<string, number>();
  const rows = await db
    .select({ subjectId: documents.subjectId, value: count() })
    .from(documents)
    .where(and(inArray(documents.subjectId, subjectIds), eq(documents.status, 'PUBLISHED')))
    .groupBy(documents.subjectId);
  return new Map(rows.map((r) => [r.subjectId, r.value]));
}

/** Everything the "subject information" tool shows on one screen. */
export async function getSubject(idOrCode: string): Promise<SubjectDetailDto> {
  const subject = await db.query.subjects.findFirst({
    // Codes keep their case (SWE201c) but people type them any way.
    where: or(eq(subjects.id, idOrCode), sql`lower(${subjects.code}) = lower(${idOrCode})`),
    with: {
      university: true,
      prerequisites: { with: { requires: { with: subjectWith } } },
      unlocks: { with: { subject: { with: subjectWith } } },
      curriculum: { with: { major: { with: { faculty: true } } } },
    },
  });

  if (!subject) throw ApiError.notFound('We could not find that subject.');

  const [counts, recent] = await Promise.all([
    documentCountsFor([subject.id]),
    db.query.documents.findMany({
      where: and(eq(documents.subjectId, subject.id), eq(documents.status, 'PUBLISHED')),
      with: documentWith,
      orderBy: desc(documents.downloads),
      limit: 4,
    }),
  ]);

  return {
    ...toSubjectSummary(subject, counts.get(subject.id) ?? 0),
    description: subject.description,
    assessment: subject.assessment,
    passCriteria: subject.passCriteria ?? [],
    assessmentScheme: subject.assessmentScheme ?? [],
    outcomes: subject.outcomes,
    topics: subject.topics,
    documentCount: counts.get(subject.id) ?? 0,
    prerequisites: subject.prerequisites.map((p) => ({
      type: p.type,
      minScore: p.minScore,
      subject: toSubjectSummary(p.requires),
    })),
    unlocks: subject.unlocks.map((p) => ({
      type: p.type,
      minScore: p.minScore,
      subject: toSubjectSummary(p.subject),
    })),
    majors: subject.curriculum.map((c) => ({
      major: toMajor(c.major),
      termNo: c.termNo,
      isRequired: c.isRequired,
    })),
    recentDocuments: recent.map((d) => toDocumentSummary(d)),
  };
}


/** The curriculum of a major: what the planner and the GPA table are built on. */
export async function getCurriculum(majorId: string) {
  const major = await db.query.majors.findFirst({
    where: eq(majors.id, majorId),
    with: { faculty: true },
  });
  if (!major) throw ApiError.notFound('We could not find that major.');

  const rows = await db.query.majorSubjects.findMany({
    where: eq(majorSubjects.majorId, majorId),
    with: { subject: { with: { university: true } } },
  });

  const counts = await documentCountsFor(rows.map((r) => r.subjectId));

  const list: CurriculumSubjectDto[] = rows
    .map((row) => ({
      ...toSubjectSummary(row.subject, counts.get(row.subjectId) ?? 0),
      termNo: row.termNo,
      isRequired: row.isRequired,
      choiceGroup: row.choiceGroup,
      requirements: row.requirements,
      passCriteria: row.subject.passCriteria ?? [],
      assessmentScheme: row.subject.assessmentScheme ?? [],
    }))
    .sort((a, b) => (a.termNo ?? 99) - (b.termNo ?? 99) || a.code.localeCompare(b.code));

  const result: CurriculumDto = { major: toMajor(major, list.length), subjects: list };
  return result;
}
