import { z } from 'zod';

/**
 * Bộ đề ôn tập (deck): one plain-text format for every subject.
 *
 * A deck is a Markdown file a person can write in Notepad and read on GitHub:
 *
 *   ---
 *   môn: MLN122
 *   tên: Ôn thi MLN122
 *   mô tả: 526 câu trắc nghiệm, có mẹo nhớ.
 *   ---
 *
 *   # Chương 1: Đối tượng và phương pháp
 *
 *   ## Mẹo 1: Trọng thương và trọng nông
 *   Trọng **thương** → nghiên cứu **lưu thông**.
 *
 *   ## Câu 12
 *   Đâu KHÔNG phải là chức năng của KTCT Mác – Lênin?
 *   - [ ] Nhận thức
 *   - [x] Giáo dục
 *   > Ghi chú: 4 chức năng: nhận thức, thực tiễn, tư tưởng, phương pháp luận.
 *   Mẹo: 1
 *   Dễ nhầm: 8, 9
 *
 * The parser turns it into DeckContent and reports every problem with its
 * line number, so the file can be fixed before anyone studies from it.
 */

export interface DeckChapter {
  n: number;
  name: string;
}

export interface DeckTip {
  n: number;
  title: string;
  /** Paragraphs split by a blank line, **bold**, and "- " list lines. */
  body: string;
  chapter: number;
}

export interface DeckQuestion {
  /** "12", or "12.1" for another way of asking question 12. */
  id: string;
  text: string;
  options: string[];
  /** Indexes into options; more than one means "choose all that apply". */
  answers: number[];
  /** 0 when the file has no chapters. */
  chapter: number;
  /** Tip numbers. */
  tips: number[];
  /** Ids of look-alike questions with different answers. */
  similar: string[];
  note?: string;
  /** Shown on request before answering. */
  hint?: string;
  /** Why the answer is right, shown after answering. */
  explain?: string;
  /** Another exam uses this answer instead. */
  alt?: string;
  /** The deck's key differs from the textbook: always shown. */
  warning?: string;
  /** The same fact asked another way, with its answer. */
  asked?: Array<{ q: string; a: string }>;
  /** For "12.1": "12". */
  parent?: string;
}

export interface DeckContent {
  chapters: DeckChapter[];
  questions: DeckQuestion[];
  tips: DeckTip[];
}

export interface DeckMeta {
  subject?: string;
  title?: string;
  description?: string;
}

export interface DeckIssue {
  line: number;
  level: 'error' | 'warning';
  message: string;
}

export interface ParsedDeck {
  meta: DeckMeta;
  content: DeckContent;
  issues: DeckIssue[];
}

/** Answer letters; a question may have at most this many options. */
export const OPTION_LETTERS = 'ABCDEFGH';

/** Lowercase, no Vietnamese marks, đ → d: for matching labels typed any way. */
export const foldVi = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const squash = (s: string) => foldVi(s).replace(/[^a-z0-9]/g, '');

const OPTION = /^\s*[-*+]\s*\[([ xX])\]\s?(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const LABEL = /^([^:]{1,24}):\s*(.*)$/;

function ids(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
}

const compareIds = (a: string, b: string) => {
  const [a1, a2 = '0'] = a.split('.');
  const [b1, b2 = '0'] = b.split('.');
  return Number(a1) - Number(b1) || Number(a2) - Number(b2);
};

interface QDraft {
  line: number;
  id: string | null;
  text: string[];
  options: string[];
  answers: number[];
  chapter: number;
  tips: number[];
  similar: string[];
  note?: string;
  hint?: string;
  explain?: string;
  alt?: string;
  warning?: string;
  asked: Array<{ q: string; a: string }>;
  lastField: 'note' | 'hint' | 'explain' | 'alt' | 'warning' | 'asked' | null;
  /** Inside a ``` code block of the question text. */
  fence: boolean;
}

interface TDraft {
  line: number;
  n: number | null;
  title: string;
  body: string[];
  chapter: number;
}

export function parseDeck(source: string): ParsedDeck {
  const issues: DeckIssue[] = [];
  const err = (line: number, message: string) => issues.push({ line, level: 'error', message });
  const warn = (line: number, message: string) => issues.push({ line, level: 'warning', message });
  const lines = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').normalize('NFC').split('\n');
  const meta: DeckMeta = {};
  let i = 0;

  // Front matter: "key: value" lines between two "---".
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trim() === '---') {
    const start = i;
    i++;
    for (; i < lines.length && lines[i].trim() !== '---'; i++) {
      const m = LABEL.exec(lines[i].trim());
      if (!m) {
        if (lines[i].trim()) warn(i + 1, 'Dòng đầu file nên có dạng "khoá: giá trị".');
        continue;
      }
      const key = squash(m[1]);
      const value = m[2].trim();
      if (key === 'mon' || key === 'subject' || key === 'mamon') meta.subject = value;
      else if (key === 'ten' || key === 'title' || key === 'tieude') meta.title = value;
      else if (key === 'mota' || key === 'description') meta.description = value;
      else warn(i + 1, `Không dùng khoá "${m[1].trim()}" — chỉ có môn, tên, mô tả.`);
    }
    if (i >= lines.length) err(start + 1, 'Phần đầu file mở bằng "---" nhưng chưa đóng bằng "---".');
    i++;
  }

  const chapters = new Map<number, string>();
  const qs: QDraft[] = [];
  const ts: TDraft[] = [];
  let chapter = 0;
  let block: { kind: 'q'; q: QDraft } | { kind: 't'; t: TDraft } | null = null;
  let strayWarned = false;

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const no = i + 1;

    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) {
      block = null;
      const title = h1[1].trim();
      const m = /^ch(?:u|ư)(?:o|ơ)ng\s+(\d+)\s*[:.\-–—]?\s*(.*)$/i.exec(title);
      if (m) {
        chapter = Number(m[1]);
        chapters.set(chapter, m[2].trim() || `Chương ${chapter}`);
      } else {
        chapter = Math.max(0, ...chapters.keys()) + 1;
        chapters.set(chapter, title);
      }
      continue;
    }

    const h2 = /^##\s+(.*)$/.exec(line) ?? (line === '##' ? ['##', ''] : null);
    if (h2) {
      const head = h2[1].trim();
      const q = /^c[âa]u(?=[\s\d:.]|$)\s*(\d+(?:\.\d+)?)?\s*[:.\-–]?\s*(.*)$/i.exec(head);
      const t = /^m[ẹeé]o(?=[\s\d:.]|$)\s*(\d+)?\s*[:.\-–]?\s*(.*)$/i.exec(head);
      if (q) {
        const rest = q[2].trim();
        const draft: QDraft = { line: no, id: q[1] ?? null, text: rest ? [rest] : [], options: [], answers: [], chapter, tips: [], similar: [], asked: [], lastField: null, fence: false };
        qs.push(draft);
        block = { kind: 'q', q: draft };
      } else if (t) {
        const title = t[2].trim();
        if (!title) err(no, 'Mẹo cần có tên, ví dụ "## Mẹo 3: Ba lần phân công lao động".');
        const draft: TDraft = { line: no, n: t[1] ? Number(t[1]) : null, title, body: [], chapter };
        ts.push(draft);
        block = { kind: 't', t: draft };
      } else {
        err(no, 'Dòng "##" phải bắt đầu bằng "Câu" hoặc "Mẹo".');
        block = null;
      }
      continue;
    }

    if (!block) {
      if (line && !strayWarned) {
        warn(no, 'Có chữ nằm ngoài câu hỏi và mẹo — Kaned bỏ qua đoạn này.');
        strayWarned = true;
      }
      continue;
    }

    if (block.kind === 't') {
      block.t.body.push(raw.replace(/\s+$/, ''));
      continue;
    }

    const q = block.q;
    // Code in the question: kept exactly, indentation and blank lines included.
    if (!q.options.length && (q.fence || /^```/.test(line))) {
      if (/^```/.test(line)) q.fence = !q.fence;
      q.text.push(raw.replace(/\s+$/, ''));
      continue;
    }
    if (!line) continue;

    const opt = OPTION.exec(raw);
    if (opt) {
      if (opt[1].toLowerCase() === 'x') q.answers.push(q.options.length);
      q.options.push(opt[2].trim());
      q.lastField = null;
      continue;
    }

    const quote = QUOTE.exec(raw);
    if (quote) {
      const body = quote[1].trim();
      const m = LABEL.exec(body);
      const key = m ? squash(m[1]) : '';
      const value = m ? m[2].trim() : body;
      if (key === 'ghichu' || key === 'note') {
        q.note = value;
        q.lastField = 'note';
      } else if (key === 'goiy' || key === 'hint') {
        q.hint = value;
        q.lastField = 'hint';
      } else if (key === 'giaithich' || key === 'explain' || key === 'rationale') {
        q.explain = value;
        q.lastField = 'explain';
      } else if (key === 'dekhac' || key === 'dapankhac') {
        q.alt = value;
        q.lastField = 'alt';
      } else if (key === 'luuydapan' || key === 'luuy' || key === 'canhbao') {
        q.warning = value;
        q.lastField = 'warning';
      } else if (key === 'hoicachkhac' || key === 'kieuhoikhac') {
        const parts = value.split(/\s*(?:→|->|=>)\s*/);
        if (parts.length < 2 || !parts[0] || !parts.slice(1).join(' ').trim()) {
          err(no, 'Viết "Hỏi cách khác: câu hỏi → đáp án".');
        } else {
          q.asked.push({ q: parts[0], a: parts.slice(1).join(' → ').trim() });
        }
        q.lastField = 'asked';
      } else if (q.lastField && q.lastField !== 'asked') {
        // A plain "> …" line continues the field above it.
        q[q.lastField] = `${q[q.lastField] ?? ''}\n${body}`.trim();
      } else {
        q.note = q.note ? `${q.note}\n${body}` : body;
        q.lastField = 'note';
      }
      continue;
    }

    const metaLine = LABEL.exec(line);
    const metaKey = metaLine ? squash(metaLine[1]) : '';
    if (metaKey === 'meo' || metaKey === 'tip' || metaKey === 'tips') {
      const nums = [...metaLine![2].matchAll(/\d+/g)].map((m) => Number(m[0]));
      if (!nums.length) warn(no, 'Dòng "Mẹo:" chưa có số mẹo nào.');
      q.tips.push(...nums);
      continue;
    }
    if (metaKey === 'denham' || metaKey === 'similar' || metaKey === 'caudenham') {
      q.similar.push(...ids(metaLine![2]));
      continue;
    }

    if (!q.options.length) {
      q.text.push(raw.replace(/\s+$/, ''));
    } else {
      q.options[q.options.length - 1] += ` ${line}`;
      warn(no, 'Dòng này được nối vào phương án phía trên. Nếu là phương án mới, viết "- [ ] …".');
    }
  }

  // Numbers: given ones are kept, missing ones continue after the largest so far.
  let next = 0;
  const seen = new Map<string, number>();
  const questions: DeckQuestion[] = [];
  for (const d of qs) {
    let id = d.id;
    if (id) next = Math.max(next, Number(id.split('.')[0]));
    else id = String(++next);
    if (seen.has(id)) err(d.line, `Câu ${id} bị trùng số với câu ở dòng ${seen.get(id)}.`);
    seen.set(id, d.line);
    if (d.fence) err(d.line, `Câu ${id} mở khối code bằng \`\`\` nhưng chưa đóng.`);
    const text = d.text.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) err(d.line, `Câu ${id} chưa có nội dung câu hỏi.`);
    if (d.options.length < 2) err(d.line, `Câu ${id} cần ít nhất 2 phương án "- [ ] …".`);
    if (d.options.length > OPTION_LETTERS.length) err(d.line, `Câu ${id} có quá ${OPTION_LETTERS.length} phương án.`);
    if (d.options.length >= 2 && !d.answers.length) err(d.line, `Câu ${id} chưa đánh dấu đáp án đúng — đổi "- [ ]" thành "- [x]".`);
    if (d.options.some((o) => !o)) err(d.line, `Câu ${id} có phương án để trống.`);
    questions.push({
      id,
      text,
      options: d.options,
      answers: d.answers,
      chapter: d.chapter,
      tips: [...new Set(d.tips)],
      similar: [...new Set(d.similar)].filter((s) => s !== id),
      ...(d.note ? { note: d.note } : {}),
      ...(d.hint ? { hint: d.hint } : {}),
      ...(d.explain ? { explain: d.explain } : {}),
      ...(d.alt ? { alt: d.alt } : {}),
      ...(d.warning ? { warning: d.warning } : {}),
      ...(d.asked.length ? { asked: d.asked } : {}),
    });
  }

  let nextTip = 0;
  const tipLine = new Map<number, number>();
  const tips: DeckTip[] = ts.map((d) => {
    const n = d.n ?? nextTip + 1;
    nextTip = Math.max(nextTip, n);
    if (tipLine.has(n)) err(d.line, `Mẹo ${n} bị trùng số với mẹo ở dòng ${tipLine.get(n)}.`);
    tipLine.set(n, d.line);
    const body = d.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!body) err(d.line, `Mẹo ${n} chưa có nội dung.`);
    return { n, title: d.title, body, chapter: d.chapter };
  });

  // Links between questions and tips must point somewhere.
  const byId = new Set(questions.map((q) => q.id));
  for (const [k, q] of questions.entries()) {
    const line = qs[k].line;
    for (const n of q.tips) if (!tipLine.has(n)) err(line, `Câu ${q.id} dùng Mẹo ${n}, nhưng file không có mẹo này.`);
    const missing = q.similar.filter((s) => !byId.has(s));
    if (missing.length) warn(line, `Câu ${q.id}: không có câu ${missing.join(', ')} để so "dễ nhầm" — đã bỏ qua.`);
    q.similar = q.similar.filter((s) => byId.has(s));
    if (q.id.includes('.')) {
      const base = q.id.split('.')[0];
      if (byId.has(base)) q.parent = base;
      else warn(line, `Câu ${q.id} là kiểu hỏi khác nhưng không có câu ${base}.`);
    }
  }

  if (!questions.length && !issues.some((x) => x.level === 'error')) err(1, 'File chưa có câu hỏi nào ("## Câu …").');

  questions.sort((a, b) => compareIds(a.id, b.id));
  tips.sort((a, b) => a.n - b.n);
  const used = new Set([...questions.map((q) => q.chapter), ...tips.map((t) => t.chapter)]);
  if (used.has(0) && chapters.size) chapters.set(0, 'Chưa xếp chương');
  const chapterList = [...chapters.entries()].filter(([n]) => used.has(n)).sort(([a], [b]) => a - b).map(([n, name]) => ({ n, name }));

  issues.sort((a, b) => a.line - b.line || (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  return { meta, content: { chapters: chapterList, questions, tips }, issues };
}

/**
 * Options that point at other options ("Tất cả các phương án trên", "Cả A và B")
 * only make sense in their original order.
 */
const REFERS = /(tren|ca hai|ca ba|ca bon|ca [a-e]\b|\b[a-e] va [a-e]\b|\b[a-e],\s*[a-e]\b|deu dung|deu sai|tat ca|khong co dap an|khong co phuong an|dap an khac|all of the above|none of the above|both)/;
export const canShuffleOptions = (q: Pick<DeckQuestion, 'options'>) => !q.options.some((o) => REFERS.test(foldVi(o)));

/** A short file that shows every part of the format. */
export const DECK_TEMPLATE = `---
môn: MLN122
tên: Ôn thi cuối kỳ MLN122
mô tả: Câu trắc nghiệm có đáp án, ghi chú và mẹo nhớ.
---

# Chương 1: Đối tượng, phương pháp và chức năng của KTCT Mác – Lênin

## Mẹo 1: 4 chức năng của KTCT Mác – Lênin
**Nhận thức – Thực tiễn – Tư tưởng – Phương pháp luận**. Không có chức năng "giáo dục".

Vận dụng quy luật để điều chỉnh chính sách → chức năng **thực tiễn**.

## Câu 1
Đâu KHÔNG phải là chức năng của kinh tế chính trị Mác – Lênin?
- [ ] Chức năng phương pháp luận
- [ ] Chức năng tư tưởng
- [ ] Chức năng nhận thức
- [x] Chức năng giáo dục
> Đề khác: Chức năng khoa học
Mẹo: 1

## Câu 1.1
Vận dụng quy luật kinh tế để điều chỉnh hành vi, chính sách là chức năng nào?
- [ ] Nhận thức
- [x] Thực tiễn
- [ ] Tư tưởng
- [ ] Phương pháp luận
Mẹo: 1

# Chương 2: Hàng hóa, thị trường

## Câu 2
Lý thuyết "bàn tay vô hình" của Adam Smith được hiểu là: (chọn 2 phương án đúng)
- [x] Cơ chế thị trường tự điều chỉnh cung cầu
- [x] Các cá nhân muốn tối đa hóa lợi ích cho mình
- [ ] Nhà nước điều tiết toàn bộ nền kinh tế
> Gợi ý: Hiện khi người học bấm “Gợi ý”, trước lúc trả lời.
> Giải thích: Hiện sau khi trả lời: vì sao đáp án đúng.
> Ghi chú: Câu nhiều đáp án: đánh dấu [x] cho mọi phương án đúng.
> Hỏi cách khác: Ai ví cơ chế thị trường là "bàn tay vô hình"? → Adam Smith
> Lưu ý đáp án: Ghi ở đây khi đáp án của đề khác giáo trình. Dòng này luôn hiện cho người học.
Dễ nhầm: 1

## Câu 3
Câu có code: đặt code giữa hai dòng \`\`\`, thụt lề được giữ nguyên.
\`\`\`dart
void main() {
  print(10 ~/ 3);
}
\`\`\`
Đoạn code in ra gì?
- [x] \`3\`
- [ ] \`3.33\`
`;

/* ───────────────────────────── API shapes ───────────────────────────── */

export const DECK_STATUSES = ['PUBLISHED', 'DRAFT'] as const;
export type DeckStatus = (typeof DECK_STATUSES)[number];

export const deckInputSchema = z.object({
  subjectId: z.string().min(1),
  source: z.string().min(1).max(950_000),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(600).nullish(),
  status: z.enum(DECK_STATUSES).default('PUBLISHED'),
});
export type DeckInput = z.infer<typeof deckInputSchema>;
export const deckUpdateSchema = deckInputSchema.partial();
export type DeckUpdate = z.infer<typeof deckUpdateSchema>;

export const deckListQuerySchema = z.object({
  subjectId: z.string().optional(),
  universityId: z.string().optional(),
  q: z.string().trim().max(120).optional(),
});
export type DeckListQuery = z.infer<typeof deckListQuerySchema>;

/** One learner's progress in one deck: what the study screens remember. */
export const deckProgressSchema = z.object({
  /**
   * Per question: correct count, wrong count, last answer right (1) or wrong (0), when,
   * and the review schedule (stability, difficulty, due date, last grade; see srs.ts).
   */
  st: z.record(
    z.object({
      c: z.number().int().min(0),
      w: z.number().int().min(0),
      l: z.union([z.literal(0), z.literal(1)]),
      t: z.number().optional(),
      s: z.number().min(0).max(10_000).optional(),
      d: z.number().min(1).max(10).optional(),
      n: z.number().optional(),
      g: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    }),
  ),
  /** Starred questions. */
  mk: z.record(z.literal(1)),
  streak: z.number().int().min(0),
  best: z.number().int().min(0),
  exams: z
    .array(z.object({ d: z.number(), n: z.number().int(), ok: z.number().int(), score: z.number(), dur: z.number(), ch: z.number().int() }))
    .max(30),
  /** Where practice stopped. */
  pr: z.object({ ch: z.number().int(), id: z.string() }).nullable(),
});
export type DeckProgress = z.infer<typeof deckProgressSchema>;
export const emptyDeckProgress = (): DeckProgress => ({ st: {}, mk: {}, streak: 0, best: 0, exams: [], pr: null });

export interface DeckSubjectRef {
  id: string;
  code: string;
  nameVi: string;
  university: { id: string; code: string; color: string };
}

export interface DeckProgressSummary {
  seen: number;
  /** By last answer. */
  ok: number;
  bad: number;
  /** By review schedule, as of the request: remembered now, and wrong, guessed or due. */
  srsOk: number;
  srsBad: number;
  marked: number;
  updatedAt: string;
}

export interface DeckSummaryDto {
  id: string;
  title: string;
  description: string | null;
  status: DeckStatus;
  questionCount: number;
  tipCount: number;
  chapterCount: number;
  subject: DeckSubjectRef;
  updatedAt: string;
  progress: DeckProgressSummary | null;
}

export interface DeckDetailDto extends DeckSummaryDto {
  content: DeckContent;
  /** The learner's saved progress, or null on a first visit. */
  state: DeckProgress | null;
}

export interface AdminDeckDto extends Omit<DeckSummaryDto, 'progress'> {
  learners: number;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface AdminDeckDetailDto extends AdminDeckDto {
  source: string;
}
