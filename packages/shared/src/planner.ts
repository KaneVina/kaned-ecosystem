/**
 * Curriculum planning.
 *
 * Each subject in a curriculum carries a list of requirements, all of which
 * must hold before a student may register for it. A requirement is one of:
 *
 *   subject   — a prior subject, by code, with either a pass or a minimum
 *               score. Several codes mean alternatives ("SWD391/SWD392").
 *   atLeast   — at least N of a list of requirements ("đạt 3/4 môn").
 *   maxDebt   — at most N subjects (and optionally C credits) not yet passed
 *               among the subjects of some terms ("kỳ 1–5 nợ tối đa 2 môn").
 *   avgScore  — the average score over a set of subjects reaches a floor
 *               ("GPA ≥ 4: PMG201c, SWD392, SWP391").
 *   all       — a labelled group whose members must all hold.
 *
 * The code is pure so the web app can re-run it on every keystroke while the
 * student types grades, and the API uses the very same function.
 */

import { DEFAULT_PASS_MARK } from './grading.js';

/* ───────────────────────── requirement model ───────────────────────── */

/** "pass" means the subject's own pass mark; a number is a score floor on the 10-point scale. */
export type ScoreRule = 'pass' | number;

export type Requirement =
  | { kind: 'subject'; codes: string[]; min: ScoreRule }
  | { kind: 'atLeast'; count: number; of: Requirement[]; label?: string }
  | { kind: 'maxDebt'; terms: number[]; maxSubjects: number; maxCredits?: number; label?: string }
  | { kind: 'avgScore'; groups: string[][]; min: number; label?: string }
  | { kind: 'all'; of: Requirement[]; label?: string };

export interface PlannerSubject {
  id: string;
  code: string;
  name: string;
  nameVi?: string | null;
  credits: number;
  /** Term the curriculum places this subject in (1-based). */
  termNo?: number | null;
  isRequired?: boolean;
  /** Subjects sharing a choice group are alternatives: passing one completes the group. */
  choiceGroup?: string | null;
  requirements?: Requirement[];
}

export interface PlannerGrade {
  subjectId: string;
  score10: number | null;
  /** True while the subject is being taken this term. */
  inProgress?: boolean;
}

export type SubjectStatus = 'passed' | 'failed' | 'in_progress' | 'available' | 'blocked';

/** One line of the checklist the UI shows under a subject. */
export interface RequirementCheck {
  ok: boolean;
  /** Not met yet only because something it depends on is still being studied. */
  pending: boolean;
  /** What the rule asks for, e.g. "PRO192 ≥ 4.0". */
  text: string;
  /** Where the student stands, e.g. "đạt 7.5", "chưa học", "nợ 3 môn". */
  detail: string;
  /** Codes this line refers to, so the UI can link them. */
  codes: string[];
  children?: RequirementCheck[];
}

export interface PlannerResult {
  subjectId: string;
  code: string;
  name: string;
  nameVi: string | null;
  credits: number;
  termNo: number | null;
  choiceGroup: string | null;
  status: SubjectStatus;
  score10: number | null;
  checks: RequirementCheck[];
  /** Codes of subjects that list this one among their requirements. */
  unlocks: string[];
}

export interface PlannerOptions {
  passMark?: number;
}

export interface PlannerSummary {
  results: PlannerResult[];
  available: PlannerResult[];
  blocked: PlannerResult[];
  passed: PlannerResult[];
  failed: PlannerResult[];
  inProgress: PlannerResult[];
  /** Credits needed for the programme; a choice group counts once. */
  totalCredits: number;
  earnedCredits: number;
  availableCredits: number;
  progressPercent: number;
}

/* ───────────────────────────── helpers ───────────────────────────── */

const fmt = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 100) / 100));

/** Every subject code a requirement mentions, used to build the "unlocks" index. */
export function requirementCodes(req: Requirement): string[] {
  switch (req.kind) {
    case 'subject':
      return req.codes;
    case 'avgScore':
      return req.groups.flat();
    case 'maxDebt':
      return [];
    case 'atLeast':
    case 'all':
      return req.of.flatMap(requirementCodes);
  }
}

/** Plain-language description of a rule, independent of any student's grades. */
export function describeRequirement(req: Requirement, passMark = DEFAULT_PASS_MARK): string {
  switch (req.kind) {
    case 'subject': {
      const who = req.codes.join(' hoặc ');
      return req.min === 'pass' ? `Qua môn ${who} (≥ ${fmt(passMark)})` : `${who} ≥ ${fmt(req.min)}`;
    }
    case 'atLeast':
      return req.label ?? `Đạt ít nhất ${req.count}/${req.of.length} điều kiện`;
    case 'maxDebt': {
      const range =
        req.terms.length > 1 ? `kỳ ${Math.min(...req.terms)}–${Math.max(...req.terms)}` : `kỳ ${req.terms[0]}`;
      const credits = req.maxCredits !== undefined ? `, không quá ${req.maxCredits} tín chỉ` : '';
      return req.label ?? `Các môn ${range} nợ tối đa ${req.maxSubjects} môn${credits}`;
    }
    case 'avgScore':
      return (
        req.label ?? `Điểm trung bình ${req.groups.map((g) => g.join('/')).join(', ')} ≥ ${fmt(req.min)}`
      );
    case 'all':
      return req.label ?? 'Thoả tất cả các điều kiện';
  }
}

/* ───────────────────────────── evaluation ───────────────────────────── */

interface Context {
  passMark: number;
  subjects: PlannerSubject[];
  byCode: Map<string, PlannerSubject>;
  gradeById: Map<string, PlannerGrade>;
}

interface Standing {
  taken: boolean;
  inProgress: boolean;
  score: number | null;
  passed: boolean;
}

function standingOf(ctx: Context, code: string): Standing {
  const subject = ctx.byCode.get(code);
  const grade = subject ? ctx.gradeById.get(subject.id) : undefined;
  if (!grade) return { taken: false, inProgress: false, score: null, passed: false };
  if (grade.inProgress) return { taken: true, inProgress: true, score: grade.score10, passed: false };
  if (grade.score10 === null || grade.score10 === undefined)
    return { taken: false, inProgress: false, score: null, passed: false };
  return {
    taken: true,
    inProgress: false,
    score: grade.score10,
    passed: grade.score10 >= ctx.passMark,
  };
}

/** Best standing among alternatives: the highest recorded score wins. */
function bestOf(ctx: Context, codes: string[]): { code: string; standing: Standing } {
  let best = { code: codes[0], standing: standingOf(ctx, codes[0]) };
  for (const code of codes.slice(1)) {
    const s = standingOf(ctx, code);
    const better =
      (s.score ?? -1) > (best.standing.score ?? -1) ||
      (!best.standing.taken && (s.taken || s.inProgress));
    if (better) best = { code, standing: s };
  }
  return best;
}

function check(ctx: Context, req: Requirement): RequirementCheck {
  const text = describeRequirement(req, ctx.passMark);

  switch (req.kind) {
    case 'subject': {
      const { code, standing } = bestOf(ctx, req.codes);
      const floor = req.min === 'pass' ? ctx.passMark : req.min;
      if (standing.inProgress) {
        return { ok: false, pending: true, text, detail: `${code} đang học`, codes: req.codes };
      }
      if (!standing.taken || standing.score === null) {
        return { ok: false, pending: false, text, detail: 'chưa học', codes: req.codes };
      }
      const ok = standing.score >= floor;
      const who = req.codes.length > 1 ? `${code} ` : '';
      return {
        ok,
        pending: false,
        text,
        detail: ok ? `${who}đạt ${fmt(standing.score)}` : `${who}${fmt(standing.score)} < ${fmt(floor)}`,
        codes: req.codes,
      };
    }

    case 'atLeast': {
      const children = req.of.map((r) => check(ctx, r));
      const met = children.filter((c) => c.ok).length;
      const couldStillMeet = met + children.filter((c) => c.pending).length >= req.count;
      return {
        ok: met >= req.count,
        pending: met < req.count && couldStillMeet,
        text,
        detail: `đạt ${met}/${children.length}, cần ${req.count}`,
        codes: req.of.flatMap(requirementCodes),
        children,
      };
    }

    case 'all': {
      const children = req.of.map((r) => check(ctx, r));
      const ok = children.every((c) => c.ok);
      return {
        ok,
        pending: !ok && children.every((c) => c.ok || c.pending),
        text,
        detail: `${children.filter((c) => c.ok).length}/${children.length} điều kiện`,
        codes: req.of.flatMap(requirementCodes),
        children,
      };
    }

    case 'maxDebt': {
      const scoped = ctx.subjects.filter(
        (s) => s.termNo !== null && s.termNo !== undefined && req.terms.includes(s.termNo) && !s.choiceGroup,
      );
      const owed = scoped.filter((s) => !standingOf(ctx, s.code).passed);
      const owedCredits = owed.reduce((sum, s) => sum + s.credits, 0);
      const ok =
        owed.length <= req.maxSubjects && (req.maxCredits === undefined || owedCredits <= req.maxCredits);
      const inProgress = owed.filter((s) => standingOf(ctx, s.code).inProgress).length;
      return {
        ok,
        pending: !ok && owed.length - inProgress <= req.maxSubjects,
        text,
        detail: owed.length
          ? `đang nợ ${owed.length} môn (${owedCredits} tín chỉ): ${owed.map((s) => s.code).join(', ')}`
          : 'không nợ môn nào',
        codes: owed.map((s) => s.code),
      };
    }

    case 'avgScore': {
      const picks = req.groups.map((group) => ({ group, ...bestOf(ctx, group) }));
      const missing = picks.filter((p) => p.standing.score === null || p.standing.inProgress);
      if (missing.length) {
        return {
          ok: false,
          pending: missing.every((p) => p.standing.inProgress),
          text,
          detail: `còn thiếu điểm ${missing.map((p) => (p.standing.taken ? p.code : p.group.join('/'))).join(', ')}`,
          codes: req.groups.flat(),
        };
      }
      const avg = picks.reduce((sum, p) => sum + (p.standing.score as number), 0) / picks.length;
      return {
        ok: avg >= req.min,
        pending: false,
        text,
        detail: `trung bình ${fmt(Math.round(avg * 100) / 100)}`,
        codes: req.groups.flat(),
      };
    }
  }
}

export function evaluatePlan(
  subjects: PlannerSubject[],
  grades: PlannerGrade[],
  options: PlannerOptions = {},
): PlannerSummary {
  const passMark = options.passMark ?? DEFAULT_PASS_MARK;
  const ctx: Context = {
    passMark,
    subjects,
    byCode: new Map(subjects.map((s) => [s.code, s])),
    gradeById: new Map(grades.map((g) => [g.subjectId, g])),
  };

  // Inverse index: which subjects mention this one.
  const unlocks = new Map<string, string[]>();
  for (const s of subjects) {
    for (const req of s.requirements ?? []) {
      for (const code of new Set(requirementCodes(req))) {
        if (!unlocks.has(code)) unlocks.set(code, []);
        if (!unlocks.get(code)!.includes(s.code)) unlocks.get(code)!.push(s.code);
      }
    }
  }

  // Once one option of a choice group is passed, the others no longer apply.
  const settledGroups = new Set(
    subjects.filter((s) => s.choiceGroup && standingOf(ctx, s.code).passed).map((s) => s.choiceGroup!),
  );

  const results: PlannerResult[] = subjects.map((subject) => {
    const own = standingOf(ctx, subject.code);
    const checks = (subject.requirements ?? []).map((r) => check(ctx, r));

    let status: SubjectStatus;
    if (own.inProgress) status = 'in_progress';
    else if (own.passed) status = 'passed';
    else if (own.taken) status = 'failed';
    else status = checks.every((c) => c.ok) ? 'available' : 'blocked';

    // The alternative to a passed option is not something left to do.
    if (subject.choiceGroup && settledGroups.has(subject.choiceGroup) && !own.passed && !own.taken) {
      status = 'passed';
    }

    return {
      subjectId: subject.id,
      code: subject.code,
      name: subject.name,
      nameVi: subject.nameVi ?? null,
      credits: subject.credits,
      termNo: subject.termNo ?? null,
      choiceGroup: subject.choiceGroup ?? null,
      status,
      score10: own.score,
      checks,
      unlocks: unlocks.get(subject.code) ?? [],
    };
  });

  // A choice group counts once, at its largest option.
  const groupCredits = new Map<string, number>();
  let totalCredits = 0;
  for (const s of subjects) {
    if (s.choiceGroup) {
      groupCredits.set(s.choiceGroup, Math.max(groupCredits.get(s.choiceGroup) ?? 0, s.credits));
    } else if (s.isRequired !== false) {
      totalCredits += s.credits;
    }
  }
  for (const c of groupCredits.values()) totalCredits += c;

  const by = (s: SubjectStatus) => results.filter((r) => r.status === s);
  const passed = by('passed');
  const available = by('available');
  const earnedCredits = passed
    .filter((r) => standingOf(ctx, r.code).passed)
    .reduce((sum, r) => sum + r.credits, 0);

  return {
    results,
    available,
    blocked: by('blocked'),
    passed,
    failed: by('failed'),
    inProgress: by('in_progress'),
    totalCredits,
    earnedCredits,
    availableCredits: available.reduce((sum, r) => sum + r.credits, 0),
    progressPercent: totalCredits ? Math.min(100, Math.round((earnedCredits / totalCredits) * 100)) : 0,
  };
}

/**
 * Suggest a term: retakes first, then available subjects from the earliest
 * curriculum term, preferring those that unlock the most, up to a credit limit.
 * Only one option of a choice group is ever suggested.
 */
export function suggestNextTerm(summary: PlannerSummary, creditLimit = 18): PlannerResult[] {
  const candidates = [...summary.failed.filter((r) => r.checks.every((c) => c.ok)), ...summary.available];
  const ranked = candidates.sort((a, b) => {
    const retakeA = a.status === 'failed' ? 0 : 1;
    const retakeB = b.status === 'failed' ? 0 : 1;
    if (retakeA !== retakeB) return retakeA - retakeB;
    const termA = a.termNo ?? 99;
    const termB = b.termNo ?? 99;
    if (termA !== termB) return termA - termB;
    if (b.unlocks.length !== a.unlocks.length) return b.unlocks.length - a.unlocks.length;
    return a.code.localeCompare(b.code);
  });

  const picked: PlannerResult[] = [];
  const groups = new Set<string>();
  let credits = 0;
  for (const subject of ranked) {
    if (subject.choiceGroup && groups.has(subject.choiceGroup)) continue;
    if (credits + subject.credits > creditLimit) continue;
    picked.push(subject);
    credits += subject.credits;
    if (subject.choiceGroup) groups.add(subject.choiceGroup);
  }
  return picked;
}
