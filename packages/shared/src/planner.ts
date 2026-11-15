/**
 * Prerequisite planning.
 *
 * Given the curriculum of a major, the prerequisite edges between subjects and
 * whatever grades a student has recorded, work out what they may register for
 * next term and what is blocked — and why.
 *
 * The logic is deliberately pure so the web app can recompute it on every
 * keystroke while the API uses the same code for the saved plan.
 */

import { DEFAULT_PASS_MARK, isPassing, isWeakPass } from './grading.js';
import type { PrereqType } from './domain.js';

export interface PlannerSubject {
  id: string;
  code: string;
  name: string;
  nameVi?: string | null;
  credits: number;
  /** Term the curriculum places this subject in (1-based). */
  termNo?: number | null;
  isRequired?: boolean;
}

export interface PlannerEdge {
  subjectId: string;
  requiresId: string;
  type: PrereqType;
}

export interface PlannerGrade {
  subjectId: string;
  score10: number | null;
  /** True while the subject is being taken this term. */
  inProgress?: boolean;
}

export type SubjectStatus = 'passed' | 'failed' | 'in_progress' | 'available' | 'blocked';

export interface BlockingReason {
  subjectId: string;
  code: string;
  name: string;
  type: PrereqType;
  /** Why this edge is not satisfied yet. */
  reason: 'not_taken' | 'failed' | 'in_progress' | 'weak_pass';
}

export interface PlannerResult {
  subjectId: string;
  code: string;
  name: string;
  credits: number;
  termNo: number | null;
  status: SubjectStatus;
  score10: number | null;
  blockedBy: BlockingReason[];
  /** Subjects that will unlock once this one is passed. */
  unlocks: string[];
  /** Depth in the prerequisite graph: 0 means nothing comes before it. */
  depth: number;
}

export interface PlannerOptions {
  passMark?: number;
  /** Treat D / D+ (a weak pass) as not good enough for a prerequisite. */
  requireStrongPass?: boolean;
}

export interface PlannerSummary {
  results: PlannerResult[];
  available: PlannerResult[];
  blocked: PlannerResult[];
  passed: PlannerResult[];
  failed: PlannerResult[];
  inProgress: PlannerResult[];
  totalCredits: number;
  earnedCredits: number;
  availableCredits: number;
  progressPercent: number;
}

function buildDepthMap(subjects: PlannerSubject[], edges: PlannerEdge[]): Map<string, number> {
  const requires = new Map<string, string[]>();
  for (const e of edges) {
    if (!requires.has(e.subjectId)) requires.set(e.subjectId, []);
    requires.get(e.subjectId)!.push(e.requiresId);
  }
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    // A cycle in the data must not hang the planner.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = requires.get(id) ?? [];
    const value = parents.length ? Math.max(...parents.map((p) => walk(p) + 1)) : 0;
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };

  for (const s of subjects) walk(s.id);
  return depth;
}

export function evaluatePlan(
  subjects: PlannerSubject[],
  edges: PlannerEdge[],
  grades: PlannerGrade[],
  options: PlannerOptions = {},
): PlannerSummary {
  const passMark = options.passMark ?? DEFAULT_PASS_MARK;
  const requireStrongPass = options.requireStrongPass ?? false;

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const gradeBySubject = new Map(grades.map((g) => [g.subjectId, g]));
  const depth = buildDepthMap(subjects, edges);

  const edgesBySubject = new Map<string, PlannerEdge[]>();
  const unlocksBySubject = new Map<string, string[]>();
  for (const e of edges) {
    if (!edgesBySubject.has(e.subjectId)) edgesBySubject.set(e.subjectId, []);
    edgesBySubject.get(e.subjectId)!.push(e);
    if (!unlocksBySubject.has(e.requiresId)) unlocksBySubject.set(e.requiresId, []);
    unlocksBySubject.get(e.requiresId)!.push(e.subjectId);
  }

  const ownStatus = (subjectId: string): { status: SubjectStatus; score: number | null } => {
    const g = gradeBySubject.get(subjectId);
    if (!g) return { status: 'available', score: null };
    if (g.inProgress) return { status: 'in_progress', score: g.score10 ?? null };
    if (g.score10 === null || g.score10 === undefined) return { status: 'available', score: null };
    return { status: isPassing(g.score10, passMark) ? 'passed' : 'failed', score: g.score10 };
  };

  const results: PlannerResult[] = subjects.map((subject) => {
    const own = ownStatus(subject.id);
    const blockedBy: BlockingReason[] = [];

    if (own.status === 'available') {
      for (const edge of edgesBySubject.get(subject.id) ?? []) {
        const required = subjectById.get(edge.requiresId);
        const label = {
          subjectId: edge.requiresId,
          code: required?.code ?? '???',
          name: required?.name ?? 'Unknown subject',
          type: edge.type,
        };
        const g = gradeBySubject.get(edge.requiresId);

        if (!g || (g.score10 === null && !g.inProgress)) {
          // A corequisite only has to be taken alongside, so an untouched one
          // does not block registration on its own.
          if (edge.type !== 'COREQUISITE') blockedBy.push({ ...label, reason: 'not_taken' });
          continue;
        }
        if (g.inProgress) {
          if (edge.type === 'PREREQUISITE') blockedBy.push({ ...label, reason: 'in_progress' });
          continue;
        }
        const score = g.score10 as number;
        if (!isPassing(score, passMark)) {
          if (edge.type === 'PRIOR') continue; // studied before, a pass is not required
          blockedBy.push({ ...label, reason: 'failed' });
          continue;
        }
        if (requireStrongPass && edge.type === 'PREREQUISITE' && isWeakPass(score, passMark)) {
          blockedBy.push({ ...label, reason: 'weak_pass' });
        }
      }
    }

    const status: SubjectStatus =
      own.status === 'available' && blockedBy.length ? 'blocked' : own.status;

    return {
      subjectId: subject.id,
      code: subject.code,
      name: subject.name,
      credits: subject.credits,
      termNo: subject.termNo ?? null,
      status,
      score10: own.score,
      blockedBy,
      unlocks: unlocksBySubject.get(subject.id) ?? [],
      depth: depth.get(subject.id) ?? 0,
    };
  });

  const by = (s: SubjectStatus) => results.filter((r) => r.status === s);
  const passed = by('passed');
  const available = by('available');
  const totalCredits = subjects.reduce((sum, s) => sum + s.credits, 0);
  const earnedCredits = passed.reduce((sum, r) => sum + r.credits, 0);

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
    progressPercent: totalCredits ? Math.round((earnedCredits / totalCredits) * 100) : 0,
  };
}

/**
 * Suggest a term: take available subjects, earliest curriculum term first, and
 * prefer the ones that unlock the most later subjects, up to a credit ceiling.
 */
export function suggestNextTerm(summary: PlannerSummary, creditLimit = 18): PlannerResult[] {
  const ranked = [...summary.available].sort((a, b) => {
    const termA = a.termNo ?? 99;
    const termB = b.termNo ?? 99;
    if (termA !== termB) return termA - termB;
    if (b.unlocks.length !== a.unlocks.length) return b.unlocks.length - a.unlocks.length;
    return a.code.localeCompare(b.code);
  });

  const picked: PlannerResult[] = [];
  let credits = 0;
  for (const subject of ranked) {
    if (credits + subject.credits > creditLimit) continue;
    picked.push(subject);
    credits += subject.credits;
  }
  return picked;
}
