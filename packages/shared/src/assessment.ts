import { z } from 'zod';
import type { CheckState, PassCriteriaValues } from './passCriteria.js';

/**
 * How a subject is graded, as FPT's syllabus (FLM) lists it:
 *
 *   No. Category        Type        Part  Weight  Completion
 *   1   Assignment      on-going    2     10%     > 0
 *   2   Practical Exam  on-going    1     20%     > 0
 *   5   Final exam      Final exam  1     40%     4
 *
 * Each category's parts are averaged, the categories are weighted into the
 * total, and a category that misses its completion criterion fails the
 * subject whatever the total.
 */
export const ASSESSMENT_TYPES = ['ongoing', 'final'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];
export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = { ongoing: 'Thường xuyên', final: 'Cuối kỳ' };

/** none: no rule · positive: must be above 0 · min: must reach `min`. */
export const COMPLETION_KINDS = ['none', 'positive', 'min'] as const;
export type CompletionKind = (typeof COMPLETION_KINDS)[number];

export const assessmentItemSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1, 'Đặt tên cho cột điểm, vd. Assignment.').max(60),
  type: z.enum(ASSESSMENT_TYPES),
  parts: z.coerce.number().int().min(1).max(20),
  weight: z.coerce.number().min(0).max(100),
  completion: z.enum(COMPLETION_KINDS),
  min: z.coerce.number().min(0).max(10).nullish(),
  /** A second attempt is allowed; its score replaces the first. */
  retake: z.boolean().optional(),
});
export type AssessmentItem = z.infer<typeof assessmentItemSchema>;
export const assessmentSchemeSchema = z.array(assessmentItemSchema).max(15);

/** Where a part's score lives in a grade's criteria record. */
export const assessmentKey = (itemId: string, part: number) => `as:${itemId}:${part}`;

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

export function describeCompletion(item: Pick<AssessmentItem, 'completion' | 'min'>): string | null {
  if (item.completion === 'positive') return '> 0';
  if (item.completion === 'min' && item.min !== null && item.min !== undefined) return `≥ ${fmt(item.min)}`;
  return null;
}

export interface AssessmentLine {
  item: AssessmentItem;
  /** Per part: first attempt, second attempt, the one that counts. */
  firsts: Array<number | null>;
  seconds: Array<number | null>;
  scores: Array<number | null>;
  /** Average of the parts once all are in. */
  avg: number | null;
  /** Points this category adds to the total (avg × weight). */
  contribution: number | null;
  /** Completion criterion: ok / bad / retake (second attempt still open) / wait. */
  state: CheckState;
  /** Parts whose first attempt fell short while a second attempt is allowed. */
  openRetake: boolean[];
}

export interface AssessmentResult {
  lines: AssessmentLine[];
  weightTotal: number;
  /** Weight of the categories that have every part filled in. */
  weightEntered: number;
  /** Total so far over the categories filled in, on the full 10-point scale. */
  partial: number;
  /** The final total once every category is in; null until then. */
  total: number | null;
  /**
   * What the missing categories need on average to reach the pass mark, and
   * the floor their own completion rules set. null when nothing is missing.
   */
  need: { names: string[]; average: number; floor: number; possible: boolean } | null;
  /** No category has failed its completion rule (missing ones are not failures). */
  completionOk: boolean;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

function meets(item: AssessmentItem, value: number) {
  if (item.completion === 'positive') return value > 0;
  if (item.completion === 'min') return value >= (item.min ?? 0);
  return true;
}

export function evaluateAssessment(
  scheme: AssessmentItem[] | null | undefined,
  values: PassCriteriaValues | null | undefined,
  passMark = 5,
): AssessmentResult {
  const items = scheme ?? [];
  const v = values ?? {};
  const weightTotal = items.reduce((s, i) => s + i.weight, 0);

  const lines = items.map<AssessmentLine>((item) => {
    const firsts: Array<number | null> = [];
    const seconds: Array<number | null> = [];
    const scores: Array<number | null> = [];
    for (let p = 0; p < item.parts; p++) {
      const key = assessmentKey(item.id, p);
      const first = num(v[key]);
      const second = item.retake ? num(v[`${key}#2`]) : null;
      firsts.push(first);
      seconds.push(second);
      scores.push(second ?? first);
    }
    const ready = scores.every((s) => s !== null);
    const avg = ready ? round2(scores.reduce<number>((s, x) => s + (x ?? 0), 0) / item.parts) : null;
    const contribution = avg !== null && weightTotal > 0 ? (avg * item.weight) / weightTotal : null;
    // A second attempt opens on a part only when the category as a whole would miss its rule.
    const firstAvg = firsts.every((f) => f !== null) ? firsts.reduce<number>((s, x) => s + (x ?? 0), 0) / item.parts : null;
    const openRetake = firsts.map((f, i) => Boolean(item.retake) && seconds[i] === null && f !== null && firstAvg !== null && !meets(item, firstAvg));
    let state: CheckState;
    if (avg === null) state = 'wait';
    else if (meets(item, avg)) state = 'ok';
    else if (openRetake.some(Boolean)) state = 'retake';
    else state = 'bad';
    return { item, firsts, seconds, scores, avg, contribution, state, openRetake };
  });

  const done = lines.filter((l) => l.avg !== null);
  const weightEntered = done.reduce((s, l) => s + l.item.weight, 0);
  const partial = round2(done.reduce((s, l) => s + (l.contribution ?? 0), 0));
  const total = lines.length && done.length === lines.length ? round2(partial) : null;

  const missing = lines.filter((l) => l.avg === null);
  let need: AssessmentResult['need'] = null;
  if (missing.length && weightTotal > 0) {
    const missingWeight = missing.reduce((s, l) => s + l.item.weight, 0);
    const floor = Math.max(0, ...missing.map((l) => (l.item.completion === 'min' ? (l.item.min ?? 0) : l.item.completion === 'positive' ? 0.01 : 0)));
    const average = missingWeight > 0 ? Math.max(0, round2(((passMark - partial) * weightTotal) / missingWeight)) : 0;
    need = { names: missing.map((l) => l.item.name), average, floor: round2(floor), possible: Math.max(average, floor) <= 10 };
  }

  return {
    lines,
    weightTotal,
    weightEntered,
    partial,
    total,
    need,
    completionOk: lines.every((l) => l.state !== 'bad' && l.state !== 'retake'),
  };
}

/**
 * Reads a table copied from FLM (or a spreadsheet): one category per line,
 * columns separated by tabs or several spaces, e.g.
 *   "1  Assignment  on-going  2  10.0%  >0"
 * Lines it cannot read are skipped.
 */
export function parseAssessmentTable(text: string, newId: () => string): AssessmentItem[] {
  const out: AssessmentItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^no\.?\s/i.test(line) || /category/i.test(line)) continue;
    const cells = line.split(/\t| {2,}/).map((c) => c.trim()).filter(Boolean);
    const weightIdx = cells.findIndex((c) => /^\d+(?:[.,]\d+)?\s*%$/.test(c));
    if (weightIdx < 0) continue;
    const weight = Number(cells[weightIdx].replace('%', '').replace(',', '.'));
    const before = cells.slice(0, weightIdx);
    // Drop a leading row number.
    if (before.length && /^\d+$/.test(before[0]) && before.length > 1) before.shift();
    let parts = 1;
    if (before.length && /^\d+$/.test(before[before.length - 1])) parts = Math.max(1, Math.min(20, Number(before.pop())));
    // The type column sits just before "Part": "on-going" or "Final exam".
    const typeText = before.length > 1 && /^(on-?going|final(\s*exam)?)$/i.test(before[before.length - 1]) ? before.pop()! : '';
    const name = before.join(' ').trim().slice(0, 60);
    if (!name) continue;
    const comp = (cells[weightIdx + 1] ?? '').replace(/\s+/g, '');
    let completion: CompletionKind = 'none';
    let min: number | null = null;
    if (/^>0$/.test(comp)) completion = 'positive';
    else if (/^(>=|≥)?\d+(?:[.,]\d+)?$/.test(comp)) {
      completion = 'min';
      min = Number(comp.replace(/^(>=|≥)/, '').replace(',', '.'));
    }
    const type: AssessmentType = /final/i.test(typeText) || (!typeText && /final/i.test(name)) ? 'final' : 'ongoing';
    out.push({ id: newId(), name, type, parts, weight, completion, min, retake: type === 'final' ? true : undefined });
  }
  return out;
}
