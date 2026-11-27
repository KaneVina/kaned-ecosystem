import { useMemo } from 'react';
import { useDecks } from './api';

/**
 * Each subject gets its own colour, worked out from its code rather than its
 * university (most decks share one university, so they would all look alike).
 * Every colour carries white text at AA contrast.
 */
export const SUBJECT_PALETTE = [
  '#2448D8', // blue
  '#0F766E', // teal
  '#7C3AED', // violet
  '#C2410C', // orange
  '#BE123C', // rose
  '#0E7490', // cyan
  '#A21CAF', // fuchsia
  '#15803D', // green
  '#4338CA', // indigo
  '#B45309', // amber
  '#0369A1', // sky
  '#BE185D', // pink
] as const;

function hash(s: string) {
  let h = 0x811c9dc5;
  for (const ch of s.toUpperCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The colour a code prefers on its own. */
export const subjectColor = (code: string) => SUBJECT_PALETTE[hash(code) % SUBJECT_PALETTE.length];

/**
 * Colours for a set of subjects with no two alike while the palette lasts:
 * each takes its preferred colour, or the next free one, in code order so the
 * result does not depend on how the list is sorted.
 */
export function subjectColors(codes: string[]) {
  const out = new Map<string, string>();
  const used = new Set<number>();
  const n = SUBJECT_PALETTE.length;
  for (const code of [...new Set(codes)].sort()) {
    let k = hash(code) % n;
    for (let step = 0; step < n && used.has(k); step++) k = (k + 1) % n;
    if (used.size < n) used.add(k);
    out.set(code, SUBJECT_PALETTE[k]);
  }
  return out;
}

/** The same colours everywhere a deck appears: worked out over all the decks the learner can see. */
export function useSubjectColor(code: string | undefined) {
  const { data } = useDecks();
  return useMemo(() => {
    if (!code) return undefined;
    const map = data ? subjectColors(data.map((d) => d.subject.code)) : null;
    return map?.get(code) ?? subjectColor(code);
  }, [data, code]);
}
