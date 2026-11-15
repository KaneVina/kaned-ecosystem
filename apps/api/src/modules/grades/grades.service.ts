import { and, eq, notInArray, sql } from 'drizzle-orm';
import {
  computeGpa,
  evaluatePlan,
  suggestNextTerm,
  type GpaSummary,
  type PlannerQuery,
  type PlannerSubject,
  type SaveGradesInput,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { grades, users } from '../../db/schema.js';
import { subjectWith, toGrade } from '../../lib/dto.js';
import { getCurriculum } from '../catalog/catalog.service.js';

export async function listGrades(userId: string) {
  const rows = await db.query.grades.findMany({
    where: eq(grades.userId, userId),
    with: { subject: { with: subjectWith } },
  });

  return rows
    .map(toGrade)
    .sort(
      (a, b) => (a.termNo ?? 99) - (b.termNo ?? 99) || a.subject.code.localeCompare(b.subject.code),
    );
}

/**
 * The grade table is saved as a whole: rows the client dropped are removed and
 * the rest are upserted, so one request keeps the UI and the database in step.
 */
export async function saveGrades(userId: string, input: SaveGradesInput) {
  const keep = input.entries.map((e) => e.subjectId);

  await db.transaction(async (tx) => {
    await tx
      .delete(grades)
      .where(
        keep.length
          ? and(eq(grades.userId, userId), notInArray(grades.subjectId, keep))
          : eq(grades.userId, userId),
      );

    if (input.entries.length) {
      await tx
        .insert(grades)
        .values(
          input.entries.map((entry) => ({
            userId,
            subjectId: entry.subjectId,
            score10: entry.score10,
            termNo: entry.termNo ?? null,
            inProgress: entry.inProgress ?? false,
          })),
        )
        .onConflictDoUpdate({
          target: [grades.userId, grades.subjectId],
          set: {
            score10: sql`excluded.score_10`,
            termNo: sql`excluded.term_no`,
            inProgress: sql`excluded.in_progress`,
            updatedAt: new Date(),
          },
        });
    }
  });

  return listGrades(userId);
}

export async function gradeSummary(userId: string): Promise<GpaSummary> {
  const [rows, user] = await Promise.all([
    db.query.grades.findMany({
      where: and(eq(grades.userId, userId), eq(grades.inProgress, false)),
      with: { subject: true },
    }),
    db.query.users.findFirst({ where: eq(users.id, userId), with: { major: true } }),
  ]);

  // Earned credits depend on the programme's pass mark (5.0 at FPT University).
  return computeGpa(
    rows.map((g) => ({
      subjectId: g.subjectId,
      subjectCode: g.subject.code,
      subjectName: g.subject.name,
      credits: g.subject.credits,
      score10: g.score10,
      termNo: g.termNo,
    })),
    user?.major?.passMark,
  );
}

/** Which subjects the student may register for, and what blocks the rest. */
export async function plan(userId: string, query: PlannerQuery) {
  const [{ major, subjects: curriculum }, gradeRows] = await Promise.all([
    getCurriculum(query.majorId),
    db.query.grades.findMany({ where: eq(grades.userId, userId) }),
  ]);

  const plannerSubjects: PlannerSubject[] = curriculum.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    nameVi: s.nameVi,
    credits: s.credits,
    termNo: s.termNo,
    isRequired: s.isRequired,
    choiceGroup: s.choiceGroup,
    requirements: s.requirements,
  }));

  const summary = evaluatePlan(
    plannerSubjects,
    gradeRows.map((g) => ({ subjectId: g.subjectId, score10: g.score10, inProgress: g.inProgress })),
    { passMark: query.passMark ?? major.passMark },
  );

  return { major, subjects: curriculum, summary, suggestion: suggestNextTerm(summary) };
}
