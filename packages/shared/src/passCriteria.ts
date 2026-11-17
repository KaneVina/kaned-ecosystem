import { z } from 'zod';

/**
 * What it takes to pass a subject, beyond the programme's pass mark.
 * FPT University, for example: PE ≥ 4 (with Speaking and Interview inside
 * it), FE = PE + TE ≥ 4, total ≥ 5, no column at 0, at most 20 % absences,
 * and for some subjects a Coursera certificate.
 *
 *   component  — one graded column (PE, FE, TE…) must reach `min`. It may
 *                allow a second attempt, and may be made of parts (Speaking,
 *                Interview…) that each have their own floor; when every part
 *                has a weight, the column is computed from them.
 *   total      — the subject's overall score must reach `min`
 *   attendance — absences stay within a number of sessions or a percentage
 *   noZero     — no column may be 0 (điểm liệt)
 *   task       — something done or not, e.g. a certificate
 */
export const PASS_CRITERION_KINDS = ['component', 'total', 'attendance', 'noZero', 'task'] as const;
export type PassCriterionKind = (typeof PASS_CRITERION_KINDS)[number];

export const PASS_CRITERION_KIND_LABELS: Record<PassCriterionKind, string> = {
  component: 'Cột điểm',
  total: 'Điểm tổng',
  attendance: 'Vắng không quá',
  noZero: 'Không điểm liệt',
  task: 'Việc phải hoàn thành',
};

const critId = z.string().min(1).max(40);
const score = z.coerce.number().min(0).max(10);

export const scorePartSchema = z.object({
  id: critId,
  label: z.string().trim().min(1, 'Đặt tên cho phần thi, vd. Speaking.').max(40),
  /** Share of the column in percent. When every part has one, the column is computed from them. */
  weight: z.coerce.number().min(0).max(100).nullish(),
  /** Floor for this part alone; it may sit above or below the column's own. */
  min: score.nullish(),
  /** A second attempt is allowed; its score replaces the first. */
  retake: z.boolean().optional(),
});
export type ScorePart = z.infer<typeof scorePartSchema>;

export const ATTENDANCE_MODES = ['sessions', 'percent'] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const passCriterionSchema = z.discriminatedUnion('kind', [
  z.object({
    id: critId,
    kind: z.literal('component'),
    label: z.string().trim().min(1, 'Đặt tên cho cột điểm, vd. PE, FE.').max(40),
    min: score,
    retake: z.boolean().optional(),
    parts: z.array(scorePartSchema).max(6).optional(),
  }),
  z.object({ id: critId, kind: z.literal('total'), min: score }),
  z.object({
    id: critId,
    kind: z.literal('attendance'),
    mode: z.enum(ATTENDANCE_MODES),
    /** Sessions (mode "sessions") or percent of sessions (mode "percent"). */
    max: z.coerce.number().min(0).max(100),
    /** Sessions in the course; students fill it in when the admin left it empty. */
    sessions: z.coerce.number().int().min(1).max(300).nullish(),
  }),
  z.object({ id: critId, kind: z.literal('noZero') }),
  z.object({
    id: critId,
    kind: z.literal('task'),
    label: z.string().trim().min(1, 'Ghi việc cần làm, vd. Hoàn thành khoá Coursera.').max(120),
  }),
]);
export type PassCriterion = z.infer<typeof passCriterionSchema>;
export type ComponentCriterion = Extract<PassCriterion, { kind: 'component' }>;
export type AttendanceCriterion = Extract<PassCriterion, { kind: 'attendance' }>;

export const passCriteriaSchema = z.array(passCriterionSchema).max(12);

/**
 * What a student recorded, flat so it stays easy to store and diff:
 *   "<id>"            first attempt of a column / absences / a ticked task
 *   "<id>#2"          second attempt of a column
 *   "<id>.<part>"     a part's first attempt;  "<id>.<part>#2" its second
 *   "<id>:n"          sessions in the course, when the admin did not set it
 */
export type PassCriteriaValues = Record<string, number | boolean>;
export const passCriteriaValuesSchema = z.record(z.string().max(100), z.union([z.number().min(0).max(300), z.boolean()]));

export const criterionKey = {
  first: (id: string) => id,
  second: (key: string) => `${key}#2`,
  part: (id: string, partId: string) => `${id}.${partId}`,
  sessions: (id: string) => `${id}:n`,
};

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

/** True when every part carries a weight, so the column is computed from its parts. */
export const isComputed = (c: ComponentCriterion) => Boolean(c.parts?.length) && c.parts!.every((p) => (p.weight ?? 0) > 0);

/** "FE = 50% PE + 50% TE" */
export function formulaOf(c: ComponentCriterion): string | null {
  if (!isComputed(c)) return null;
  return `${c.label} = ${c.parts!.map((p) => `${fmt(p.weight!)}% ${p.label}`).join(' + ')}`;
}

/** Highest number of absences allowed, when it can be known. */
export function absenceLimit(c: AttendanceCriterion, sessions: number | null): number | null {
  if (c.mode === 'sessions') return c.max;
  if (!sessions) return null;
  return Math.floor((sessions * c.max) / 100 + 1e-9);
}

export function describeCriterion(c: PassCriterion): string {
  switch (c.kind) {
    case 'total':
      return `Điểm tổng ≥ ${fmt(c.min)}`;
    case 'component':
      return `${c.label} ≥ ${fmt(c.min)}`;
    case 'attendance':
      return c.mode === 'sessions'
        ? `Vắng không quá ${fmt(c.max)}${c.sessions ? `/${c.sessions}` : ''} buổi`
        : `Vắng không quá ${fmt(c.max)}% số buổi${c.sessions ? ` (${absenceLimit(c, c.sessions)}/${c.sessions} buổi)` : ''}`;
    case 'noZero':
      return 'Không có cột điểm 0 (điểm liệt)';
    case 'task':
      return c.label;
  }
}

/**
 *   ok      met
 *   bad     not met, nothing left to try
 *   retake  first attempt fell short, a second attempt is still open
 *   wait    not recorded yet
 */
export type CheckState = 'ok' | 'bad' | 'retake' | 'wait';
const WORST: CheckState[] = ['bad', 'retake', 'wait', 'ok'];
const worst = (states: CheckState[]): CheckState => WORST.find((s) => states.includes(s)) ?? 'ok';

/** One score box: a column or a part, with its attempts. */
export interface ScoreLine {
  key: string;
  label: string;
  min: number | null;
  weight: number | null;
  retake: boolean;
  first: number | null;
  second: number | null;
  /** Second attempt when there is one, else the first. */
  effective: number | null;
  state: CheckState;
}

export interface CriterionCheck {
  criterion: PassCriterion;
  text: string;
  state: CheckState;
  /** true met, false not met (or waiting on a retake), null not recorded yet. */
  ok: boolean | null;
  /** Short reason shown under the line, e.g. "Interview 3.5 < 4". */
  detail?: string;
  value: number | boolean | null;
  /** Columns: the column itself and its parts. */
  score?: ScoreLine;
  parts?: ScoreLine[];
  formula?: string | null;
  /** Attendance. */
  attendance?: { absent: number | null; sessions: number | null; askSessions: boolean; limit: number | null; left: number | null };
  /** No-zero rule: the columns that are 0. */
  zeros?: string[];
}

export interface PassCriteriaResult {
  checks: CriterionCheck[];
  /** Every criterion met. */
  met: boolean;
  /** Criteria nobody has filled in yet. */
  missing: number;
  /** Columns waiting on a second attempt. */
  retakes: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function scoreLine(
  values: PassCriteriaValues,
  key: string,
  label: string,
  min: number | null | undefined,
  retake: boolean | undefined,
  weight: number | null | undefined,
  computedFirst?: number | null,
): ScoreLine {
  const first = computedFirst !== undefined ? computedFirst : num(values[key]);
  const second = retake ? num(values[criterionKey.second(key)]) : null;
  const effective = second ?? first;
  const floor = min ?? null;
  let state: CheckState;
  if (effective === null) state = 'wait';
  else if (floor === null || effective >= floor) state = 'ok';
  else if (retake && second === null) state = 'retake';
  else state = 'bad';
  return { key, label, min: floor, weight: weight ?? null, retake: Boolean(retake), first, second, effective, state };
}

const toOk = (s: CheckState) => (s === 'ok' ? true : s === 'wait' ? null : false);

function lineDetail(l: ScoreLine): string | undefined {
  if (l.state === 'retake') return `${l.label} lần 1 được ${fmt(l.first!)} < ${fmt(l.min!)} — còn thi lại lần 2`;
  if (l.state === 'bad' && l.effective !== null && l.min !== null)
    return `${l.label}${l.second !== null ? ' lần 2' : ''} được ${fmt(l.effective)} < ${fmt(l.min)}`;
  return undefined;
}

/**
 * Checks a student's record against a subject's criteria. Anything not yet
 * recorded counts as missing, so the subject is not passed until every line
 * is filled in and met.
 */
export function evaluatePassCriteria(
  criteria: PassCriterion[] | null | undefined,
  score10: number | null,
  values: PassCriteriaValues | null | undefined,
): PassCriteriaResult {
  const list = criteria ?? [];
  const v = values ?? {};
  const scoreLines: ScoreLine[] = [];

  const checks = list.map<CriterionCheck>((c) => {
    const text = describeCriterion(c);
    switch (c.kind) {
      case 'total': {
        const state: CheckState = score10 === null ? 'wait' : score10 >= c.min ? 'ok' : 'bad';
        return { criterion: c, text, state, ok: toOk(state), value: score10 };
      }
      case 'component': {
        const computed = isComputed(c);
        const parts = (c.parts ?? []).map((p) => scoreLine(v, criterionKey.part(c.id, p.id), p.label, p.min, p.retake, p.weight));
        let computedFirst: number | null | undefined;
        if (computed) {
          const ready = parts.every((p) => p.effective !== null);
          const sumW = parts.reduce((s, p) => s + (p.weight ?? 0), 0);
          computedFirst = ready && sumW > 0 ? Math.round((parts.reduce((s, p) => s + p.effective! * (p.weight ?? 0), 0) / sumW) * 100) / 100 : null;
        }
        const main = scoreLine(v, criterionKey.first(c.id), c.label, c.min, computed ? false : c.retake, null, computedFirst);
        // A part without its own floor only matters when it feeds the computed column.
        const counted = parts.filter((p) => computed || p.min !== null);
        scoreLines.push(...(computed ? parts : [main, ...parts]));
        const state = worst([main.state, ...counted.map((p) => p.state)]);
        const failing = [...counted, main].find((l) => l.state === 'bad') ?? [...counted, main].find((l) => l.state === 'retake');
        return {
          criterion: c,
          text,
          state,
          ok: toOk(state),
          value: main.effective,
          score: main,
          parts,
          formula: formulaOf(c),
          detail: failing ? lineDetail(failing) : undefined,
        };
      }
      case 'attendance': {
        const absent = num(v[criterionKey.first(c.id)]);
        const sessions = c.sessions ?? num(v[criterionKey.sessions(c.id)]);
        const limit = absenceLimit(c, sessions);
        let state: CheckState;
        if (absent === null || limit === null) state = 'wait';
        else state = absent <= limit ? 'ok' : 'bad';
        const left = absent !== null && limit !== null ? limit - absent : null;
        return {
          criterion: c,
          text,
          state,
          ok: toOk(state),
          value: absent,
          attendance: { absent, sessions, askSessions: !c.sessions && c.mode === 'percent', limit, left },
          detail:
            state === 'bad'
              ? `Đã vắng ${absent} buổi, quá giới hạn ${limit} buổi`
              : limit === null && c.mode === 'percent'
                ? 'Nhập tổng số buổi của môn để tính giới hạn'
                : undefined,
        };
      }
      case 'task': {
        const done = v[c.id] === true;
        const state: CheckState = done ? 'ok' : 'wait';
        return { criterion: c, text, state, ok: toOk(state), value: done };
      }
      case 'noZero':
        return { criterion: c, text, state: 'wait', ok: null, value: v[c.id] === true };
    }
  });

  // The no-zero rule looks at every score recorded above, so it is settled last.
  for (const check of checks) {
    if (check.criterion.kind !== 'noZero') continue;
    const zeroLines = scoreLines.filter((l) => l.effective === 0);
    const zeros = zeroLines.map((l) => l.label);
    const confirmed = v[check.criterion.id] === true;
    check.zeros = zeros;
    // A 0 that a second attempt can still replace is not final yet.
    const pending = zeroLines.length > 0 && zeroLines.every((l) => l.state === 'retake' || (l.retake && l.second === null));
    check.state = zeros.length ? (pending ? 'retake' : 'bad') : confirmed ? 'ok' : 'wait';
    check.ok = toOk(check.state);
    check.detail = zeros.length
      ? `${zeros.join(', ')} bằng 0 — điểm liệt${pending ? ', còn thi lại lần 2' : ''}`
      : confirmed
        ? undefined
        : 'Xác nhận các cột còn lại (bài tập, quiz…) không có điểm 0';
  }

  return {
    checks,
    met: checks.every((c) => c.state === 'ok'),
    missing: checks.filter((c) => c.state === 'wait').length,
    retakes: checks.filter((c) => c.state === 'retake').length,
  };
}

/** True when the subject has criteria and they are not all met yet. */
export function criteriaBlockPass(
  criteria: PassCriterion[] | null | undefined,
  score10: number | null,
  values: PassCriteriaValues | null | undefined,
) {
  if (!criteria?.length) return false;
  return !evaluatePassCriteria(criteria, score10, values).met;
}
