import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  canShuffleOptions,
  emptyDeckProgress,
  foldVi,
  memoryOf,
  memoryStatus,
  OPTION_LETTERS,
  review,
  urgency,
  type Grade,
  type MemoryRecord,
  type DeckChapter,
  type DeckDetailDto,
  type DeckProgress,
  type DeckQuestion,
  type DeckTip,
} from '@kaned/shared';
import { deckKeys, saveDeckProgress, saveDeckProgressOnExit } from './api';

export const LET = OPTION_LETTERS;
export type Scope = 'all' | 'new' | 'bad' | 'mk';
export type Status = 'new' | 'ok' | 'bad';

export const shuffle = <T,>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
export const makePerm = (q: DeckQuestion, on: boolean) => {
  const p = q.options.map((_, i) => i);
  return on && canShuffleOptions(q) ? shuffle(p) : p;
};
export const qLabel = (q: DeckQuestion) => `Câu ${q.id}`;

export const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};
export const fmtScore = (s: number) => (Math.round(s * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
export const grade10 = (s: number): [string, 'good' | 'low'] =>
  s >= 9 ? ['Xuất sắc', 'good'] : s >= 8 ? ['Giỏi', 'good'] : s >= 6.5 ? ['Khá', 'good'] : s >= 5 ? ['Đạt', 'good'] : ['Cần ôn thêm', 'low'];

/* ─────────────────────────────── settings ─────────────────────────────── */

export interface StudySettings {
  /** Show memory tips after an answer. Answer warnings always show. */
  tips: boolean;
  /** Show look-alike questions. */
  sim: boolean;
  /** Shuffle A, B, C, D (questions with "all of the above" keep their order). */
  shuf: boolean;
  /** Go to the next question after a right answer. */
  auto: boolean;
  sound: boolean;
  /**
   * Spaced repetition: after a right answer the learner says how sure they
   * were, and questions come back for review on a schedule.
   */
  srs: boolean;
}

const SETTINGS_KEY = 'kaned.decks.settings';
const DEFAULT_SETTINGS: StudySettings = { tips: true, sim: true, shuf: false, auto: false, sound: false, srs: true };

/** The saved settings, read once (for pages outside a deck). */
export function readStudySettings(): StudySettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export const srsOn = () => readStudySettings().srs;

export function useStudySettings() {
  const [settings, setSettings] = useState<StudySettings>(() => {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const set = useCallback(<K extends keyof StudySettings>(k: K, v: StudySettings[K]) => {
    setSettings((s) => {
      const next = { ...s, [k]: v };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* private mode: settings last for this visit */
      }
      return next;
    });
  }, []);
  return [settings, set] as const;
}

let audio: AudioContext | null = null;
export function beep(ok: boolean) {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const t0 = audio.currentTime;
    (ok ? [660, 990] : [300, 220]).forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = ok ? 'sine' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.14, t0 + i * 0.09 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.2);
      o.connect(g).connect(audio!.destination);
      o.start(t0 + i * 0.09);
      o.stop(t0 + i * 0.09 + 0.22);
    });
  } catch {
    /* no audio: silence is fine */
  }
}

/* ─────────────────────────────── progress ─────────────────────────────── */

export interface Counts {
  all: number;
  ok: number;
  bad: number;
  mk: number;
  nw: number;
  seen: number;
}

/**
 * The learner's progress in one deck. Every change is kept in the page at
 * once and sent to Kaned a moment later, and again when the page is hidden
 * or closed, so nothing is lost and the next device sees the same thing.
 */
export function useDeckProgress(deck: DeckDetailDto) {
  const client = useQueryClient();
  const [state, setState] = useState<DeckProgress>(() => deck.state ?? emptyDeckProgress());
  const latest = useRef(state);
  const dirty = useRef(false);
  const timer = useRef<number>();

  const flush = useCallback(
    (onExit = false) => {
      window.clearTimeout(timer.current);
      if (!dirty.current) return;
      dirty.current = false;
      const snapshot = latest.current;
      client.setQueryData<DeckDetailDto>(deckKeys.one(deck.id), (old) => (old ? { ...old, state: snapshot } : old));
      if (onExit) return saveDeckProgressOnExit(deck.id, snapshot);
      saveDeckProgress(deck.id, snapshot)
        .then(() => client.invalidateQueries({ queryKey: ['decks', 'list'] }))
        .catch(() => {
          dirty.current = true;
        });
    },
    [client, deck.id],
  );

  const update = useCallback(
    (fn: (s: DeckProgress) => DeckProgress) => {
      const next = fn(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      setState(next);
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(), 1500);
    },
    [flush],
  );

  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && flush(true);
    const exit = () => flush(true);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', exit);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', exit);
      flush();
    };
  }, [flush]);

  /**
   * Records an answer. `grade` is how sure the learner was (3 sure, 2 unsure,
   * 1 guessed); a wrong answer is always 1. Pass `base`, the record from
   * before this answer, to change the grade of an answer already recorded.
   */
  const record = useCallback(
    (id: string, ok: boolean, o: { grade?: Grade; streak?: boolean; base?: MemoryRecord | null } = {}) =>
      update((s) => {
        const again = o.base !== undefined;
        const prev = again ? (o.base ?? undefined) : s.st[id];
        let run = s.streak;
        let best = s.best;
        if (o.streak !== false && !again) {
          run = ok ? run + 1 : 0;
          best = Math.max(best, run);
        }
        const at = again ? (s.st[id]?.t ?? Date.now()) : Date.now();
        return { ...s, streak: run, best, st: { ...s.st, [id]: review(prev, ok, o.grade ?? 3, at) } };
      }),
    [update],
  );

  const toggleMark = useCallback(
    (id: string) => {
      const on = !latest.current.mk[id];
      update((s) => {
        const mk = { ...s.mk };
        if (on) mk[id] = 1;
        else delete mk[id];
        return { ...s, mk };
      });
      return on;
    },
    [update],
  );

  const addExam = useCallback(
    (x: DeckProgress['exams'][number]) => update((s) => ({ ...s, exams: [x, ...s.exams].slice(0, 30) })),
    [update],
  );

  const setResume = useCallback(
    (pr: DeckProgress['pr']) => update((s) => (s.pr?.id === pr?.id && s.pr?.ch === pr?.ch ? s : { ...s, pr })),
    [update],
  );

  const reset = useCallback(() => update(() => emptyDeckProgress()), [update]);

  return useMemo(() => ({ state, record, toggleMark, addExam, setResume, reset }), [state, record, toggleMark, addExam, setResume, reset]);
}

/* ─────────────────────────────── the deck ─────────────────────────────── */

export interface DeckModel {
  Q: DeckQuestion[];
  QI: Map<string, DeckQuestion>;
  tips: Map<number, DeckTip>;
  /** Questions each tip is used by, in deck order. */
  tipQuestions: Map<number, string[]>;
  /** Questions with an answer warning, for the tips page. */
  warnings: DeckQuestion[];
  chapters: DeckChapter[];
  chapterName: (n: number) => string;
  base: number;
  search: string[];
}

export function useDeckModel(deck: DeckDetailDto): DeckModel {
  return useMemo(() => {
    const { questions: Q, tips: T, chapters } = deck.content;
    const QI = new Map(Q.map((q) => [q.id, q]));
    const tips = new Map(T.map((t) => [t.n, t]));
    const tipQuestions = new Map<number, string[]>(T.map((t) => [t.n, []]));
    for (const q of Q) for (const n of q.tips) tipQuestions.get(n)?.push(q.id);
    const names = new Map(chapters.map((c) => [c.n, c.name]));
    return {
      Q,
      QI,
      tips,
      tipQuestions,
      warnings: Q.filter((q) => q.warning),
      chapters,
      chapterName: (n: number) => names.get(n) ?? '',
      base: Q.filter((q) => !q.parent).length,
      search: Q.map((q) => foldVi(`${q.id} ${q.text} ${q.options.join(' ')} ${q.note ?? ''} ${q.explain ?? ''}`)),
    };
  }, [deck.content]);
}

export function makeStatus(state: DeckProgress, srs: boolean, now = Date.now()) {
  const status = (id: string): Status => memoryStatus(state.st[id], srs, now);
  const marked = (id: string) => Boolean(state.mk[id]);
  return { status, marked };
}

export function countsOf(m: DeckModel, state: DeckProgress, srs: boolean, ch = 0): Counts {
  const { status, marked } = makeStatus(state, srs);
  const c: Counts = { all: 0, ok: 0, bad: 0, mk: 0, nw: 0, seen: 0 };
  for (const q of m.Q) {
    if (ch && q.chapter !== ch) continue;
    c.all++;
    const s = status(q.id);
    if (s === 'ok') c.ok++;
    else if (s === 'bad') c.bad++;
    else c.nw++;
    if (marked(q.id)) c.mk++;
  }
  c.seen = c.ok + c.bad;
  return c;
}

/** Questions for a session. With scheduling on, "Cần ôn" puts the closest to forgotten first. */
export function poolOf(m: DeckModel, state: DeckProgress, ch: number, scope: Scope, srs: boolean) {
  const now = Date.now();
  const { status, marked } = makeStatus(state, srs, now);
  const ids = m.Q.filter(
    (q) =>
      (!ch || q.chapter === ch) &&
      (scope === 'all' || (scope === 'new' && status(q.id) === 'new') || (scope === 'bad' && status(q.id) === 'bad') || (scope === 'mk' && marked(q.id))),
  ).map((q) => q.id);
  if (srs && scope === 'bad') ids.sort((a, b) => urgency(state.st[a], now) - urgency(state.st[b], now));
  return ids;
}

/** Review dates coming up, for the overview. */
export function forecastOf(m: DeckModel, state: DeckProgress, now = Date.now()) {
  const DAY = 86_400_000;
  const days = Array.from({ length: 7 }, () => 0);
  for (const q of m.Q) {
    const r = state.st[q.id];
    if (!r || memoryStatus(r, true, now) !== 'ok') continue;
    const i = Math.floor((memoryOf(r).due - now) / DAY);
    if (i < 7) days[Math.max(0, i)]++;
  }
  return days;
}

/** "10 phút", "5 giờ", "3 ngày", "2 tháng". */
export function fmtWait(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} phút`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} giờ`;
  const d = Math.round(h / 24);
  if (d < 45) return `${d} ngày`;
  return `${Math.round(d / 30)} tháng`;
}

/** A deck summary's remembered and to-review counts under the learner's setting. */
export function summaryCounts(p: { ok: number; bad: number; srsOk?: number; srsBad?: number }, srs: boolean) {
  return srs && p.srsOk !== undefined ? { ok: p.srsOk, bad: p.srsBad ?? 0 } : { ok: p.ok, bad: p.bad };
}

export const CONFIDENCE: Array<{ g: Grade; label: string; key: string; tone: string }> = [
  { g: 3, label: 'Chắc', key: '1', tone: 'is-sure' },
  { g: 2, label: 'Phân vân', key: '2', tone: 'is-unsure' },
  { g: 1, label: 'Đoán', key: '3', tone: 'is-guess' },
];

/* ─────────────────────────────── sessions ─────────────────────────────── */

export interface Custom {
  ids: string[];
  label: string;
}

export interface PracticeSession {
  ch: number;
  scope: Scope;
  order: 'seq' | 'rand';
  ids: string[];
  idx: number;
  perm: Record<string, number[]>;
  /** Per answered question: picks, right or not, how sure (when asked), and the record from before. */
  res: Record<string, { sel: number[]; ok: boolean; g?: Grade; base?: MemoryRecord | null }>;
  custom: Custom | null;
  finished: boolean;
}

export interface FlipSession {
  ch: number;
  scope: Scope;
  order: 'seq' | 'rand';
  ids: string[];
  idx: number;
  know: string[];
  again: string[];
  perm: Record<string, number[]>;
  custom: Custom | null;
}

export interface ExamSession {
  phase: 'setup' | 'run' | 'result';
  n: number;
  min: number;
  ch: number;
  ids: string[];
  perm: Record<string, number[]>;
  ans: Record<string, number[]>;
  flag: Record<string, boolean>;
  idx: number;
  t0: number;
  end: number;
  res: { items: Array<{ id: string; sel: number[]; ok: boolean }>; okN: number; score: number; dur: number; fresh: boolean } | null;
  rf: 'all' | 'wrong' | 'right';
}

export const newExam = (): ExamSession => ({ phase: 'setup', n: 50, min: 60, ch: 0, ids: [], perm: {}, ans: {}, flag: {}, idx: 0, t0: 0, end: 0, res: null, rf: 'all' });

/* ─────────────────────────────── search ─────────────────────────────── */

/** Words that say nothing about which question is meant (English and Vietnamese, without accents). */
const STOP = new Set(
  ('a an the is are was were be been of to in on at for and or by with as it its this that these those what which who how why when where ' +
    'does do did can could should would will may might must has have had from into than then there their them they you your we our ' +
    'not no about per if so but i me my la gi cua va cac nhung mot cho trong voi thi ma nao ve o khi duoc bi')
    .split(' '),
);

/** Exam banks ask the same thing in different words. */
const SYNONYMS: string[][] = [
  ['mainly', 'primarily', 'primary', 'chiefly', 'mostly'],
  ['commonly', 'typically', 'usually', 'often', 'generally', 'common', 'typical'],
  ['purpose', 'role', 'goal', 'function', 'used for'],
  ['best', 'most suitable', 'most appropriate', 'recommended'],
  ['benefit', 'advantage'],
  ['screen', 'page', 'route'],
  ['store', 'save', 'persist'],
  ['retrieve', 'read', 'get', 'fetch', 'load'],
];
const SYN = new Map<string, string[]>();
for (const g of SYNONYMS) for (const w of g) SYN.set(w, g);

/** The words of a search that count: folded, without punctuation and filler words. */
export function searchTerms(q: string): string[] {
  const all = foldVi(q)
    .split(/[^a-z0-9_.@#+-]+/)
    .map((w) => w.replace(/^[.+-]+|[.+-]+$/g, ''))
    .filter(Boolean);
  const kept = all.filter((w) => w.length > 1 && !STOP.has(w));
  return kept.length ? kept : all;
}

/** Whether one search word appears in a question, allowing synonyms and word endings (represent ~ represents). */
function termIn(doc: string, t: string) {
  if (doc.includes(t)) return true;
  for (const s of SYN.get(t) ?? []) if (doc.includes(s)) return true;
  if (t.length >= 6) {
    const stem = t.replace(/(ing|ed|es|s|ly)$/, '');
    if (stem.length >= 5 && doc.includes(stem)) return true;
  }
  return false;
}

/** Search words plus their synonyms and stems, for marking matches. */
export function markTerms(terms: string[]) {
  const out = new Set<string>();
  for (const t of terms) {
    out.add(t);
    for (const x of SYN.get(t) ?? []) out.add(x);
    if (t.length >= 6) {
      const stem = t.replace(/(ing|ed|es|s|ly)$/, '');
      if (stem.length >= 5) out.add(stem);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** Share of search words found in a question, 0–1. */
export function matchScore(doc: string, terms: string[]) {
  if (!terms.length) return 1;
  let n = 0;
  for (const t of terms) if (termIn(doc, t)) n++;
  return n / terms.length;
}

/** Share of words a near match needs: lower when nothing matches every word. */
export const NEAR_MATCH = 0.6;
export const NEAR_MATCH_WITH_FULL = 0.75;

/** Splits text into plain and matched pieces, matching without accents. */
export function highlight(text: string, terms: string[]): Array<{ t: string; hit: boolean }> {
  if (!terms.length) return [{ t: text, hit: false }];
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = foldVi(text[i]);
    for (let j = 0; j < n.length; j++) {
      norm += n[j];
      map.push(i);
    }
  }
  const ranges: Array<[number, number]> = [];
  for (const t of terms) {
    let from = 0;
    let x: number;
    while ((x = norm.indexOf(t, from)) !== -1) {
      ranges.push([map[x], map[x + t.length - 1] + 1]);
      from = x + t.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: Array<{ t: string; hit: boolean }> = [];
  let last = 0;
  for (const [s, e] of ranges) {
    if (e <= last) continue;
    const start = Math.max(s, last);
    if (start > last) out.push({ t: text.slice(last, start), hit: false });
    out.push({ t: text.slice(start, e), hit: true });
    last = e;
  }
  if (last < text.length) out.push({ t: text.slice(last), hit: false });
  return out;
}
