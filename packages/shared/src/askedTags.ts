/**
 * Exam-term tags at the start of a question, like `[FA26_B10][SU26_B5] Which language…`.
 * Each tag says the question showed up in that term's exam (term code, then the block length in weeks),
 * so the number of tags is how often it has been asked.
 */

export interface AskedTag {
  /** Term code, upper-case: FA26. */
  term: string;
  /** Block length in weeks (B5 → 5, B10 → 10), when the tag has one. */
  block: number | null;
  /** Orders terms in time: year × 10 + season (SP 1, SU 2, FA 3). */
  rank: number;
  /** As written for people: "SU26 · B5". */
  label: string;
}

const SEASON: Record<string, number> = { SP: 1, SU: 2, FA: 3 };
const TAG = /^\s*\[\s*([A-Za-z]{2})\s?(\d{2})(?:\s*[_\- ]?\s*[Bb](?:lock)?\s?(\d+))?\s*\]/;

/** Time order of a term code such as "SU26"; 0 when it does not look like one. */
export function termRank(term: string): number {
  const m = /^([A-Za-z]{2})(\d{2})$/.exec(term.trim());
  return m ? Number(m[2]) * 10 + (SEASON[m[1].toUpperCase()] ?? 0) : 0;
}

/** Takes the leading `[…]` tags off a question and returns them, newest term first, with the clean text. */
export function splitAskedTags(text: string): { tags: AskedTag[]; text: string } {
  let rest = text;
  const seen = new Map<string, AskedTag>();
  for (;;) {
    const m = TAG.exec(rest);
    if (!m) break;
    const term = `${m[1].toUpperCase()}${m[2]}`;
    const block = m[3] ? Number(m[3]) : null;
    const key = `${term}_${block ?? ''}`;
    if (!seen.has(key)) seen.set(key, { term, block, rank: termRank(term), label: block ? `${term} · B${block}` : term });
    rest = rest.slice(m[0].length);
  }
  if (!seen.size) return { tags: [], text };
  const tags = [...seen.values()].sort((a, b) => b.rank - a.rank || (b.block ?? 0) - (a.block ?? 0));
  return { tags, text: rest.replace(/^\s+/, '') };
}

/** Just the clean text, for places that must not show the tags (an exam paper, say). */
export const stripAskedTags = (text: string) => splitAskedTags(text).text;

/** Which terms a filter lets through: only that term, or that term and everything after it. */
export type TermFilter = { mode: 'only' | 'from'; term: string };

export function matchesTermFilter(tags: AskedTag[], f: TermFilter | null): boolean {
  if (!f) return true;
  const rank = termRank(f.term);
  return tags.some((t) => (f.mode === 'only' ? t.term === f.term : t.rank >= rank));
}

/** "only:SU26" / "from:SU26" ⇄ filter, so it can sit in a <select>. */
export const termFilterKey = (f: TermFilter | null) => (f ? `${f.mode}:${f.term}` : '');
export function parseTermFilter(key: string): TermFilter | null {
  const m = /^(only|from):([A-Z]{2}\d{2})$/.exec(key);
  return m ? { mode: m[1] as 'only' | 'from', term: m[2] } : null;
}
