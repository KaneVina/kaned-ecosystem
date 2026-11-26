import { z } from 'zod';
import { DOCUMENT_TYPES, FILE_FORMATS } from './domain.js';

/**
 * Kai, the on-site assistant. The understanding happens in the browser; the API only
 * answers one structured question: "find documents, flashcard decks, subjects and
 * lecturers that match these keywords and filters", ranked.
 */

export const ASSISTANT_KINDS = ['docs', 'decks', 'subjects', 'lecturers'] as const;
export type AssistantKind = (typeof ASSISTANT_KINDS)[number];

const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : v ? v.split(',') : []).map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).max(values.length));

export const assistantSearchSchema = z.object({
  /** Keywords left after the subject, type, term… were taken out. */
  q: z.string().trim().max(200).optional(),
  /** A subject code such as PRM393. */
  subject: z.string().trim().toUpperCase().regex(/^[A-Z]{2,5}\d{2,4}[A-Z]?$/).optional(),
  types: csv(DOCUMENT_TYPES),
  formats: csv(FILE_FORMATS),
  /** FPT-style term code: SP25, SU25, FA24. */
  term: z.string().trim().toUpperCase().regex(/^(SP|SU|FA)\d{2}$/).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  kinds: csv(ASSISTANT_KINDS),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});
export type AssistantSearchQuery = z.input<typeof assistantSearchSchema>;

export interface AssistantDocHit {
  id: string;
  title: string;
  type: string;
  format: string;
  subjectCode: string;
  subjectName: string;
  downloads: number;
  ratingAvg: number;
  ratingCount: number;
  pages: number | null;
  year: number | null;
  internal: boolean;
  createdAt: number;
  /** Why it matched, for the chat ("tiêu đề", "môn", "thẻ"…). */
  why: string[];
}
export interface AssistantDeckHit {
  id: string;
  title: string;
  subjectCode: string;
  subjectName: string;
  questionCount: number;
  tipCount: number;
}
export interface AssistantSubjectHit {
  id: string;
  code: string;
  name: string;
  nameVi: string | null;
  credits: number | null;
  docCount: number;
  deckId: string | null;
}
export interface AssistantLecturerHit {
  id: string;
  fullName: string;
  code: string | null;
  department: string | null;
  email: string | null;
  kind: string;
}
export interface AssistantSearchResult {
  subject: { id: string; code: string; name: string; nameVi: string | null } | null;
  /** Subject ids behind the code (one per school), for a library link. */
  subjectIds: string[];
  docs: { items: AssistantDocHit[]; total: number; capped: boolean };
  decks: AssistantDeckHit[];
  subjects: AssistantSubjectHit[];
  lecturers: AssistantLecturerHit[];
  /** Set when lecturers were asked for but the viewer is not signed in. */
  lecturersNeedLogin?: boolean;
  tookMs: number;
}

/** Folds Vietnamese for matching: lower case, no tone marks, đ → d. */
export const foldText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/** Every accented Vietnamese letter (both cases) and its plain lower-case letter, for SQL translate(). */
export const VI_FOLD_FROM_TO = (() => {
  const base = 'aăâeêioôơuưy';
  const out: Array<[string, string]> = [];
  const marks = ['̀', '́', '̃', '̉', '̣', ''];
  for (const ch of base) {
    for (const m of marks) {
      for (const c of [ch, ch.toUpperCase()]) {
        const composed = (c + m).normalize('NFC');
        const folded = foldText(composed);
        if (composed !== folded) out.push([composed, folded]);
      }
    }
  }
  out.push(['đ', 'd'], ['Đ', 'd']);
  const seen = new Set<string>();
  const uniq = out.filter(([f]) => (seen.has(f) ? false : (seen.add(f), true)));
  return { from: uniq.map((x) => x[0]).join(''), to: uniq.map((x) => x[1]).join('') };
})();
