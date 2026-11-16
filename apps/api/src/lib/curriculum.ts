import { and, eq, inArray } from 'drizzle-orm';
import type { Requirement } from '@kaned/shared';
import { db } from '../db/index.js';
import { faculties, majorSubjects, majors, subjectPrerequisites, subjects } from '../db/schema.js';

/** Applies fn to every subject code anywhere in a rule tree. */
export function mapRequirementCodes(req: Requirement, fn: (code: string) => string): Requirement {
  switch (req.kind) {
    case 'subject':
      return { ...req, codes: req.codes.map(fn) };
    case 'avgScore':
      return { ...req, groups: req.groups.map((g) => g.map(fn)) };
    case 'atLeast':
    case 'all':
      return { ...req, of: req.of.map((r) => mapRequirementCodes(r, fn)) };
    default:
      return req;
  }
}

/** "pass" is stricter than any score floor; otherwise the higher floor wins. */
const stricter = (a: number | null, b: number | null) => (a === null ? b !== null : b !== null && a > b);

/**
 * The subject pages read a flat prerequisite index (subject_prerequisites)
 * while the planner reads the rule trees. This rebuilds the index for the
 * given subjects from the top-level subject rules of every programme they
 * are in. Group rules ("3 of 4", averages) stay in the trees only.
 */
export async function rebuildPrerequisiteEdges(subjectIds: string[]) {
  const ids = [...new Set(subjectIds)];
  if (!ids.length) return;

  const rows = await db.query.majorSubjects.findMany({
    where: inArray(majorSubjects.subjectId, ids),
    with: { subject: true },
  });

  const universityIds = [...new Set(rows.map((r) => r.subject.universityId))];
  const known = universityIds.length
    ? await db
        .select({ id: subjects.id, code: subjects.code, universityId: subjects.universityId })
        .from(subjects)
        .where(inArray(subjects.universityId, universityIds))
    : [];
  const idByCode = new Map(known.map((s) => [`${s.universityId}:${s.code}`, s.id]));

  const edges = new Map<string, { subjectId: string; requiresId: string; minScore: number | null }>();
  for (const row of rows) {
    for (const req of row.requirements) {
      if (req.kind !== 'subject') continue;
      const minScore = req.min === 'pass' ? null : req.min;
      for (const code of req.codes) {
        const requiresId = idByCode.get(`${row.subject.universityId}:${code}`);
        if (!requiresId || requiresId === row.subjectId) continue;
        const key = `${row.subjectId}>${requiresId}`;
        const previous = edges.get(key);
        if (!previous || stricter(minScore, previous.minScore)) {
          edges.set(key, { subjectId: row.subjectId, requiresId, minScore });
        }
      }
    }
  }

  await db.delete(subjectPrerequisites).where(inArray(subjectPrerequisites.subjectId, ids));
  if (edges.size) {
    await db
      .insert(subjectPrerequisites)
      .values([...edges.values()].map((e) => ({ ...e, type: 'PREREQUISITE' as const })))
      .onConflictDoNothing();
  }
}

/**
 * A subject code changed: rewrite every rule in the university's programmes
 * that mentions the old code, so prerequisites keep pointing at the subject.
 * Returns the subjects whose rules changed.
 */
export async function renameCodeInRules(universityId: string, from: string, to: string) {
  if (from === to) return [];
  const rows = await db
    .select({ majorId: majorSubjects.majorId, subjectId: majorSubjects.subjectId, requirements: majorSubjects.requirements })
    .from(majorSubjects)
    .innerJoin(majors, eq(majors.id, majorSubjects.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(faculties.universityId, universityId));

  const touched: string[] = [];
  for (const row of rows) {
    const before = JSON.stringify(row.requirements);
    if (!before.includes(`"${from}"`)) continue;
    const requirements = row.requirements.map((r) => mapRequirementCodes(r, (c) => (c === from ? to : c)));
    await db
      .update(majorSubjects)
      .set({ requirements })
      .where(and(eq(majorSubjects.majorId, row.majorId), eq(majorSubjects.subjectId, row.subjectId)));
    touched.push(row.subjectId);
  }
  return touched;
}
