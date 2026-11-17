import { z } from 'zod';

/**
 * What it takes to pass a subject, beyond the programme's pass mark.
 * FPT University, for example: PE ≥ 4, FE ≥ 4, total ≥ 5, and for some
 * subjects "finish the Coursera course" and "get the Coursera certificate".
 *
 *   total     — the subject's overall score must reach `min`
 *   component — one graded part (PE, FE, Lab…) must reach `min`
 *   task      — something done or not, e.g. a certificate
 */
export const PASS_CRITERION_KINDS = ['total', 'component', 'task'] as const;
export type PassCriterionKind = (typeof PASS_CRITERION_KINDS)[number];

export const PASS_CRITERION_KIND_LABELS: Record<PassCriterionKind, string> = {
  total: 'Điểm tổng ≥',
  component: 'Điểm thành phần ≥',
  task: 'Việc phải hoàn thành',
};

export const passCriterionSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1).max(40), kind: z.literal('total'), min: z.coerce.number().min(0).max(10) }),
  z.object({
    id: z.string().min(1).max(40),
    kind: z.literal('component'),
    label: z.string().trim().min(1, 'Đặt tên cho phần điểm, vd. PE, FE.').max(40),
    min: z.coerce.number().min(0).max(10),
  }),
  z.object({
    id: z.string().min(1).max(40),
    kind: z.literal('task'),
    label: z.string().trim().min(1, 'Ghi việc cần làm, vd. Hoàn thành khoá Coursera.').max(120),
  }),
]);
export type PassCriterion = z.infer<typeof passCriterionSchema>;

export const passCriteriaSchema = z.array(passCriterionSchema).max(12);

/** What a student recorded per criterion: a score for components, done/not for tasks. */
export type PassCriteriaValues = Record<string, number | boolean>;
export const passCriteriaValuesSchema = z.record(z.string().max(40), z.union([z.number().min(0).max(10), z.boolean()]));

export function describeCriterion(c: PassCriterion): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  if (c.kind === 'total') return `Điểm tổng ≥ ${n(c.min)}`;
  if (c.kind === 'component') return `${c.label} ≥ ${n(c.min)}`;
  return c.label;
}

export interface CriterionCheck {
  criterion: PassCriterion;
  text: string;
  /** true met, false not met, null not recorded yet. */
  ok: boolean | null;
  value: number | boolean | null;
}

export interface PassCriteriaResult {
  checks: CriterionCheck[];
  /** Every criterion met. False as soon as one is unmet or missing. */
  met: boolean;
  /** Criteria nobody has filled in yet. */
  missing: number;
}

/**
 * Checks a student's record against a subject's criteria. A task that was not
 * ticked counts as not done; a component with no score counts as missing,
 * which also means the subject is not passed yet.
 */
export function evaluatePassCriteria(
  criteria: PassCriterion[] | null | undefined,
  score10: number | null,
  values: PassCriteriaValues | null | undefined,
): PassCriteriaResult {
  const list = criteria ?? [];
  const v = values ?? {};
  const checks = list.map<CriterionCheck>((c) => {
    if (c.kind === 'total') return { criterion: c, text: describeCriterion(c), value: score10, ok: score10 === null ? null : score10 >= c.min };
    if (c.kind === 'component') {
      const raw = v[c.id];
      const score = typeof raw === 'number' ? raw : null;
      return { criterion: c, text: describeCriterion(c), value: score, ok: score === null ? null : score >= c.min };
    }
    const done = v[c.id] === true;
    return { criterion: c, text: describeCriterion(c), value: done, ok: done ? true : v[c.id] === false ? false : null };
  });
  return {
    checks,
    met: checks.every((c) => c.ok === true),
    missing: checks.filter((c) => c.ok === null).length,
  };
}

/** True when the subject has criteria and they are not all met yet. */
export function criteriaBlockPass(criteria: PassCriterion[] | null | undefined, score10: number | null, values: PassCriteriaValues | null | undefined) {
  if (!criteria?.length) return false;
  return !evaluatePassCriteria(criteria, score10, values).met;
}
