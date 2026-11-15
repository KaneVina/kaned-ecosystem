/**
 * Grading rules for Vietnamese universities.
 *
 * The 10-point score a student receives is converted to a letter and to the
 * 4.0 scale. Universities differ slightly, so the whole table lives in one
 * place: change GRADE_SCALE and every GPA in the product follows.
 */

export interface GradeBand {
  /** Inclusive lower bound on the 10-point scale. */
  min: number;
  letter: string;
  gpa4: number;
  labelVi: string;
}

export const GRADE_SCALE: GradeBand[] = [
  { min: 8.5, letter: 'A', gpa4: 4.0, labelVi: 'Giỏi' },
  { min: 8.0, letter: 'B+', gpa4: 3.5, labelVi: 'Khá giỏi' },
  { min: 7.0, letter: 'B', gpa4: 3.0, labelVi: 'Khá' },
  { min: 6.5, letter: 'C+', gpa4: 2.5, labelVi: 'Trung bình khá' },
  { min: 5.5, letter: 'C', gpa4: 2.0, labelVi: 'Trung bình' },
  { min: 5.0, letter: 'D+', gpa4: 1.5, labelVi: 'Trung bình yếu' },
  { min: 4.0, letter: 'D', gpa4: 1.0, labelVi: 'Yếu' },
  { min: 0, letter: 'F', gpa4: 0, labelVi: 'Kém' },
];

/** Lowest 10-point score that still counts as a pass. */
export const DEFAULT_PASS_MARK = 4.0;

/** A pass, but one many faculties ask you to retake before a dependent subject. */
export const WEAK_PASS_CEILING = 5.0;

export function gradeBandFor(score10: number): GradeBand {
  const s = clampScore(score10);
  return GRADE_SCALE.find((b) => s >= b.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
}

export function clampScore(score10: number): number {
  if (Number.isNaN(score10)) return 0;
  return Math.min(10, Math.max(0, score10));
}

export function toLetter(score10: number): string {
  return gradeBandFor(score10).letter;
}

export function toGpa4(score10: number): number {
  return gradeBandFor(score10).gpa4;
}

export function isPassing(score10: number, passMark: number = DEFAULT_PASS_MARK): boolean {
  return clampScore(score10) >= passMark;
}

export function isWeakPass(score10: number, passMark: number = DEFAULT_PASS_MARK): boolean {
  const s = clampScore(score10);
  return s >= passMark && s < WEAK_PASS_CEILING;
}

export const CLASSIFICATIONS = [
  { min: 3.6, en: 'Excellent', vi: 'Xuất sắc' },
  { min: 3.2, en: 'Very good', vi: 'Giỏi' },
  { min: 2.5, en: 'Good', vi: 'Khá' },
  { min: 2.0, en: 'Average', vi: 'Trung bình' },
  { min: 0, en: 'Below average', vi: 'Yếu' },
] as const;

export function classify(gpa4: number): { en: string; vi: string } {
  const hit = CLASSIFICATIONS.find((c) => gpa4 >= c.min) ?? CLASSIFICATIONS[CLASSIFICATIONS.length - 1];
  return { en: hit.en, vi: hit.vi };
}

export interface GradeEntryInput {
  subjectId: string;
  subjectCode?: string;
  subjectName?: string;
  credits: number;
  score10: number | null;
  /** 1-based term the subject was taken in, when the student recorded it. */
  termNo?: number | null;
  /** Subjects flagged as not counting toward the GPA (physical education, defence education…). */
  excludeFromGpa?: boolean;
}

export interface TermSummary {
  termNo: number;
  credits: number;
  earnedCredits: number;
  gpa10: number;
  gpa4: number;
  subjectCount: number;
}

export interface GpaSummary {
  gpa10: number;
  gpa4: number;
  /** Credits attempted with a recorded score. */
  totalCredits: number;
  /** Credits from subjects that were passed. */
  earnedCredits: number;
  failedCredits: number;
  gradedCount: number;
  failedCount: number;
  weakPassCount: number;
  classification: { en: string; vi: string };
  byTerm: TermSummary[];
  letterCounts: Record<string, number>;
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Credit-weighted GPA on both scales. Subjects without a score are ignored,
 * which lets the UI keep empty rows in the table while the user types.
 */
export function computeGpa(entries: GradeEntryInput[], passMark: number = DEFAULT_PASS_MARK): GpaSummary {
  const graded = entries.filter(
    (e) => e.score10 !== null && e.score10 !== undefined && !e.excludeFromGpa && e.credits > 0,
  );

  let sum10 = 0;
  let sum4 = 0;
  let totalCredits = 0;
  let earnedCredits = 0;
  let failedCredits = 0;
  let failedCount = 0;
  let weakPassCount = 0;
  const letterCounts: Record<string, number> = {};
  const terms = new Map<number, GradeEntryInput[]>();

  for (const entry of graded) {
    const score = clampScore(entry.score10 as number);
    const credits = entry.credits;
    totalCredits += credits;
    sum10 += score * credits;
    sum4 += toGpa4(score) * credits;

    const letter = toLetter(score);
    letterCounts[letter] = (letterCounts[letter] ?? 0) + 1;

    if (isPassing(score, passMark)) {
      earnedCredits += credits;
      if (isWeakPass(score, passMark)) weakPassCount += 1;
    } else {
      failedCredits += credits;
      failedCount += 1;
    }

    const term = entry.termNo ?? 0;
    if (!terms.has(term)) terms.set(term, []);
    terms.get(term)!.push(entry);
  }

  const byTerm: TermSummary[] = [...terms.entries()]
    .filter(([termNo]) => termNo > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([termNo, list]) => {
      let credits = 0;
      let earned = 0;
      let t10 = 0;
      let t4 = 0;
      for (const e of list) {
        const score = clampScore(e.score10 as number);
        credits += e.credits;
        t10 += score * e.credits;
        t4 += toGpa4(score) * e.credits;
        if (isPassing(score, passMark)) earned += e.credits;
      }
      return {
        termNo,
        credits,
        earnedCredits: earned,
        gpa10: credits ? round(t10 / credits) : 0,
        gpa4: credits ? round(t4 / credits) : 0,
        subjectCount: list.length,
      };
    });

  const gpa10 = totalCredits ? round(sum10 / totalCredits) : 0;
  const gpa4 = totalCredits ? round(sum4 / totalCredits) : 0;

  return {
    gpa10,
    gpa4,
    totalCredits,
    earnedCredits,
    failedCredits,
    gradedCount: graded.length,
    failedCount,
    weakPassCount,
    classification: classify(gpa4),
    byTerm,
    letterCounts,
  };
}

/**
 * "What score do I need across the remaining credits to reach a target GPA?"
 * Returns null when the target is already out of reach or needs no work.
 */
export function requiredAverage(
  current: GpaSummary,
  remainingCredits: number,
  targetGpa4: number,
): { needed: number; reachable: boolean } | null {
  if (remainingCredits <= 0) return null;
  const totalAfter = current.totalCredits + remainingCredits;
  const needed = (targetGpa4 * totalAfter - current.gpa4 * current.totalCredits) / remainingCredits;
  return { needed: round(needed), reachable: needed <= 4 && needed >= 0 };
}
