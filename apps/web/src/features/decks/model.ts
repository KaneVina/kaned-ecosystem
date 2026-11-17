import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  canShuffleOptions,
  emptyDeckProgress,
  foldVi,
  OPTION_LETTERS,
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
}

const SETTINGS_KEY = 'kaned.decks.settings';
const DEFAULT_SETTINGS: StudySettings = { tips: true, sim: true, shuf: false, auto: false, sound: false };

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

  const record = useCallback(
    (id: string, ok: boolean, streak = true) =>
      update((s) => {
        const r = s.st[id] ?? { c: 0, w: 0, l: 0 as const };
        let run = s.streak;
        let best = s.best;
        if (streak) {
          run = ok ? run + 1 : 0;
          best = Math.max(best, run);
        }
        return { ...s, streak: run, best, st: { ...s.st, [id]: { c: r.c + (ok ? 1 : 0), w: r.w + (ok ? 0 : 1), l: ok ? 1 : 0, t: Date.now() } } };
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

export function makeStatus(state: DeckProgress) {
  const status = (id: string): Status => {
    const r = state.st[id];
    return !r ? 'new' : r.l ? 'ok' : 'bad';
  };
  const marked = (id: string) => Boolean(state.mk[id]);
  return { status, marked };
}

export function countsOf(m: DeckModel, state: DeckProgress, ch = 0): Counts {
  const { status, marked } = makeStatus(state);
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

export function poolOf(m: DeckModel, state: DeckProgress, ch: number, scope: Scope) {
  const { status, marked } = makeStatus(state);
  return m.Q.filter(
    (q) =>
      (!ch || q.chapter === ch) &&
      (scope === 'all' || (scope === 'new' && status(q.id) === 'new') || (scope === 'bad' && status(q.id) === 'bad') || (scope === 'mk' && marked(q.id))),
  ).map((q) => q.id);
}

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
  res: Record<string, { sel: number[]; ok: boolean }>;
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
