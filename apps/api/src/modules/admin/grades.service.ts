import { eq, inArray } from 'drizzle-orm';
import {
  computeGpa,
  criteriaBlockPass,
  DEFAULT_PASS_MARK,
  toGpa4,
  toLetter,
  type AdminGradesOverviewDto,
  type AdminGradesQuery,
  type AdminStudentGradeRowDto,
  type AdminUserGradesDto,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { grades, users } from '../../db/schema.js';
import { notFound } from './util.js';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

type GradeRow = typeof grades.$inferSelect & {
  subject: { id: string; code: string; name: string; nameVi: string; credits: number; passCriteria: unknown; assessmentScheme: unknown };
};

function summarize(rows: GradeRow[], passMark: number) {
  return computeGpa(
    rows
      .filter((g) => !g.inProgress)
      .map((g) => ({
        subjectId: g.subjectId,
        subjectCode: g.subject.code,
        subjectName: g.subject.name,
        credits: g.subject.credits,
        score10: g.score10,
        termNo: g.termNo,
        criteriaMet: !criteriaBlockPass(g.subject.passCriteria as never, g.score10, g.criteria, g.subject.assessmentScheme as never, passMark),
      })),
    passMark,
  );
}

/**
 * Every student who has entered grades, with GPA and standing. Computed in
 * memory: one row per grade is small, and sorting by GPA needs all of them.
 */
export async function gradesOverview(query: AdminGradesQuery): Promise<AdminGradesOverviewDto> {
  const rows = (await db.query.grades.findMany({
    with: {
      subject: { columns: { id: true, code: true, name: true, nameVi: true, credits: true, passCriteria: true, assessmentScheme: true } },
    },
  })) as GradeRow[];

  const byUser = new Map<string, GradeRow[]>();
  for (const r of rows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }
  const ids = [...byUser.keys()];
  const people = ids.length
    ? await db.query.users.findMany({ where: inArray(users.id, ids), with: { university: true, major: true } })
    : [];

  let list: AdminStudentGradeRowDto[] = people.map((u) => {
    const mine = byUser.get(u.id) ?? [];
    const s = summarize(mine, u.major?.passMark ?? DEFAULT_PASS_MARK);
    const updated = mine.reduce((t, g) => (g.updatedAt > t ? g.updatedAt : t), mine[0]?.updatedAt ?? new Date(0));
    return {
      user: { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl ?? null },
      university: u.university ? { id: u.university.id, code: u.university.code } : null,
      major: u.major ? { id: u.major.id, code: u.major.code, nameVi: u.major.nameVi } : null,
      year: u.year ?? null,
      gpa4: s.gpa4,
      gpa10: s.gpa10,
      classification: s.classification.vi,
      earnedCredits: s.earnedCredits,
      totalCredits: s.totalCredits,
      gradedCount: s.gradedCount,
      failedCount: s.failedCount,
      inProgressCount: mine.filter((g) => g.inProgress).length,
      updatedAt: updated.toISOString(),
    };
  });

  const stats = {
    students: list.length,
    avgGpa4: list.length ? Math.round((list.reduce((t, r) => t + r.gpa4, 0) / list.length) * 100) / 100 : 0,
    failing: list.filter((r) => r.failedCount > 0).length,
    gradedSubjects: list.reduce((t, r) => t + r.gradedCount, 0),
  };

  if (query.q) {
    const q = fold(query.q);
    list = list.filter((r) => fold(`${r.user.name} ${r.user.email} ${r.major?.code ?? ''}`).includes(q));
  }
  if (query.universityId) list = list.filter((r) => r.university?.id === query.universityId);
  if (query.majorId) list = list.filter((r) => r.major?.id === query.majorId);
  if (query.standing === 'failing') list = list.filter((r) => r.failedCount > 0);
  else if (query.standing === 'warning') list = list.filter((r) => r.gradedCount > 0 && r.gpa4 < 2);
  else if (query.standing === 'good') list = list.filter((r) => r.gpa4 >= 3.2);

  const sorters: Record<AdminGradesQuery['sort'], (a: AdminStudentGradeRowDto, b: AdminStudentGradeRowDto) => number> = {
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    gpa_desc: (a, b) => b.gpa4 - a.gpa4 || b.earnedCredits - a.earnedCredits,
    gpa_asc: (a, b) => a.gpa4 - b.gpa4,
    name: (a, b) => a.user.name.localeCompare(b.user.name, 'vi'),
  };
  list.sort(sorters[query.sort]);

  const total = list.length;
  const start = (query.page - 1) * query.pageSize;
  return {
    items: list.slice(start, start + query.pageSize),
    total,
    page: query.page,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    stats,
  };
}

/** One student's whole grade sheet, with component scores and pass conditions. */
export async function userGrades(userId: string): Promise<AdminUserGradesDto> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), with: { major: true } });
  if (!user) notFound('người dùng');
  const rows = (await db.query.grades.findMany({
    where: eq(grades.userId, userId),
    with: {
      subject: { columns: { id: true, code: true, name: true, nameVi: true, credits: true, passCriteria: true, assessmentScheme: true } },
    },
  })) as GradeRow[];
  const passMark = user.major?.passMark ?? DEFAULT_PASS_MARK;

  return {
    summary: summarize(rows, passMark),
    passMark,
    major: user.major ? { id: user.major.id, code: user.major.code, nameVi: user.major.nameVi } : null,
    grades: rows
      .map((g) => {
        const blocked = g.score10 !== null && criteriaBlockPass(g.subject.passCriteria as never, g.score10, g.criteria, g.subject.assessmentScheme as never, passMark);
        const outcome: AdminUserGradesDto['grades'][number]['outcome'] = g.inProgress
          ? 'in_progress'
          : g.score10 !== null && g.score10 >= passMark
            ? blocked
              ? 'conditions'
              : 'passed'
            : 'failed';
        return {
          subject: { id: g.subject.id, code: g.subject.code, name: g.subject.name, nameVi: g.subject.nameVi, credits: g.subject.credits },
          score10: g.score10,
          termNo: g.termNo,
          inProgress: g.inProgress,
          letter: g.score10 !== null && !g.inProgress ? toLetter(g.score10) : null,
          gpa4: g.score10 !== null && !g.inProgress ? toGpa4(g.score10) : null,
          outcome,
          criteria: g.criteria ?? {},
          passCriteria: (g.subject.passCriteria ?? []) as never,
          assessmentScheme: (g.subject.assessmentScheme ?? []) as never,
          updatedAt: g.updatedAt.toISOString(),
        };
      })
      .sort((a, b) => (a.termNo ?? 99) - (b.termNo ?? 99) || a.subject.code.localeCompare(b.subject.code)),
  };
}
