/**
 * Exam-term tags at the start of a question, like `[FA26_B10][SU26_B5] Which language…`.
 * Each tag says the question showed up in that term's exam (term code, then the block length in weeks),
 * so the number of tags is how often it has been asked.
 */

export interface AskedTag {
  /** The tag as written, upper-case, and what people pick and read: FA26_B10 (FA26 when it has no block). */
  code: string;
  /** Term part of the code: FA26. */
  term: string;
  /** Block length in weeks (B5 → 5, B10 → 10), when the tag has one. */
  block: number | null;
  /** Orders terms in time: year × 10 + season (SP 1, SU 2, FA 3). */
  rank: number;
  /** Same as `code`, kept as the display name. */
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
    const code = block ? `${term}_B${block}` : term;
    if (!seen.has(code)) seen.set(code, { code, term, block, rank: termRank(term), label: code });
    rest = rest.slice(m[0].length);
  }
  if (!seen.size) return { tags: [], text };
  const tags = [...seen.values()].sort((a, b) => b.rank - a.rank || (b.block ?? 0) - (a.block ?? 0));
  return { tags, text: rest.replace(/^\s+/, '') };
}

/** Just the clean text, for places that must not show the tags (an exam paper, say). */
export const stripAskedTags = (text: string) => splitAskedTags(text).text;

/**
 * Which exams a filter lets through. `code` is a full tag code such as FA26_B10:
 * "only" is exactly that exam, "from" is that exam's term and every later term.
 */
export type TermFilter = { mode: 'only' | 'from'; code: string };

export function matchesTermFilter(tags: AskedTag[], f: TermFilter | null): boolean {
  if (!f) return true;
  const rank = termRank(f.code.split('_')[0]);
  return tags.some((t) => (f.mode === 'only' ? t.code === f.code : t.rank >= rank));
}

/** "only:SU26" / "from:SU26" ⇄ filter, so it can sit in a <select>. */
export const termFilterKey = (f: TermFilter | null) => (f ? `${f.mode}:${f.code}` : '');
export function parseTermFilter(key: string): TermFilter | null {
  const m = /^(only|from):([A-Z]{2}\d{2}(?:_B\d+)?)$/.exec(key);
  return m ? { mode: m[1] as 'only' | 'from', code: m[2] } : null;
}
