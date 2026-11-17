/**
 * Spaced repetition for flashcard decks, after FSRS-5 (the scheduler Anki
 * uses). Each question carries a memory state: stability S (days until the
 * chance of remembering falls to 90%) and difficulty D (1–10). Every answer
 * updates both and sets the next review date.
 *
 * Grades: 1 wrong or guessed, 2 unsure, 3 sure. A right answer that was a
 * guess is treated as not remembered, so it comes back soon.
 */

export type Grade = 1 | 2 | 3 | 4;

/** What a deck remembers about one question. Older saves only have c, w, l, t. */
export interface MemoryRecord {
  /** Times answered right. */
  c: number;
  /** Times answered wrong. */
  w: number;
  /** Last answer right (1) or wrong (0). */
  l: 0 | 1;
  /** Last answered, ms. */
  t?: number;
  /** Stability, days. */
  s?: number;
  /** Difficulty, 1–10. */
  d?: number;
  /** Due for review, ms. */
  n?: number;
  /** Last grade. */
  g?: Grade;
}

export type MemoryStatus = 'new' | 'ok' | 'bad';

/** FSRS-5 default weights. */
const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
  0.51655, 0.6621,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const DAY = 86_400_000;
/** Reviews are planned for when the chance of remembering falls to this. */
export const SRS_RETENTION = 0.9;
const MAX_DAYS = 180;
/** A wrong or guessed question comes back this soon (ms), like Anki's relearning step. */
const RELEARN = 10 * 60_000;
const MIN_S = 0.01;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Chance of remembering after `days` with stability `s`. */
export const retrievability = (days: number, s: number) => Math.pow(1 + (FACTOR * Math.max(0, days)) / Math.max(MIN_S, s), DECAY);

/** Days until retrievability falls to the target. With the default target this equals S. */
export const intervalDays = (s: number) => clamp((s / FACTOR) * (Math.pow(SRS_RETENTION, 1 / DECAY) - 1), 0, MAX_DAYS);

const initD = (g: Grade) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

function nextD(d: number, g: Grade) {
  const delta = -W[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  return clamp(W[7] * initD(4) + (1 - W[7]) * damped, 1, 10);
}

function recallS(d: number, s: number, r: number, g: Grade) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
}

function forgetS(d: number, s: number, r: number) {
  const next = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(next, s);
}

const sameDayS = (s: number, g: Grade) => s * Math.exp(W[17] * (g - 3 + W[18]));

/**
 * The memory state of a record. Saves from before scheduling existed are read
 * as one review at their last answer: sure if it was right, wrong if not.
 */
export function memoryOf(r: MemoryRecord): { s: number; d: number; t: number; due: number; g: Grade } {
  if (r.s !== undefined && r.d !== undefined && r.n !== undefined) return { s: r.s, d: r.d, t: r.t ?? 0, due: r.n, g: r.g ?? (r.l ? 3 : 1) };
  const g: Grade = r.l ? 3 : 1;
  const s = W[g - 1];
  const t = r.t ?? 0;
  return { s, d: initD(g), t, due: t + (g === 1 ? RELEARN : intervalDays(s) * DAY), g };
}

/** The record after one answer. `ok` counts it as right or wrong; `grade` is how sure the learner was. */
export function review(prev: MemoryRecord | undefined, ok: boolean, grade: Grade, now = Date.now()): MemoryRecord {
  const g: Grade = ok ? grade : 1;
  let s: number;
  let d: number;
  if (!prev) {
    s = W[g - 1];
    d = initD(g);
  } else {
    const m = memoryOf(prev);
    const days = (now - m.t) / DAY;
    d = nextD(m.d, g);
    if (days < 1) s = sameDayS(m.s, g);
    else {
      const r = retrievability(days, m.s);
      s = g === 1 ? forgetS(m.d, m.s, r) : recallS(m.d, m.s, r, g);
    }
  }
  s = clamp(s, MIN_S, MAX_DAYS * 4);
  const base = prev ?? { c: 0, w: 0, l: 0 as const };
  return {
    c: base.c + (ok ? 1 : 0),
    w: base.w + (ok ? 0 : 1),
    l: ok ? 1 : 0,
    t: now,
    s: Math.round(s * 1000) / 1000,
    d: Math.round(d * 1000) / 1000,
    n: Math.round(now + (g === 1 ? RELEARN : intervalDays(s) * DAY)),
    g,
  };
}

/**
 * Where a question stands. With scheduling on, a question needs review when
 * its last answer was wrong or a guess, or when its review date has come;
 * otherwise only the last answer counts.
 */
export function memoryStatus(r: MemoryRecord | undefined, srs: boolean, now = Date.now()): MemoryStatus {
  if (!r) return 'new';
  if (!srs) return r.l ? 'ok' : 'bad';
  const m = memoryOf(r);
  return m.g === 1 || m.due <= now ? 'bad' : 'ok';
}

/** How close a question is to being forgotten: lower comes first. */
export function urgency(r: MemoryRecord | undefined, now = Date.now()) {
  if (!r) return 2;
  const m = memoryOf(r);
  if (m.g === 1) return -1 + retrievability((now - m.t) / DAY, m.s) / 10;
  return retrievability((now - m.t) / DAY, m.s);
}

/** Counts under both readings, for summaries that do not know the learner's choice. */
export function memoryCounts(st: Record<string, MemoryRecord>, now = Date.now()) {
  const out = { ok: 0, bad: 0, srsOk: 0, srsBad: 0, dueToday: 0, dueWeek: 0 };
  const endOfDay = now + DAY;
  for (const r of Object.values(st)) {
    if (r.l) out.ok++;
    else out.bad++;
    const s = memoryStatus(r, true, now);
    if (s === 'ok') out.srsOk++;
    else out.srsBad++;
    if (s === 'ok') {
      const due = memoryOf(r).due;
      if (due <= endOfDay) out.dueToday++;
      if (due <= now + 7 * DAY) out.dueWeek++;
    }
  }
  return out;
}
