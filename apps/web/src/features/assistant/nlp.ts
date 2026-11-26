import { foldText, type AssistantKind, type DocumentType, type FileFormat } from '@kaned/shared';

/**
 * Kai's understanding of a Vietnamese (or English) question, entirely in the browser:
 * entities (subject code, document type, term, format, a score), what the person wants
 * (how-to, search, open a page, small talk) and the keywords left over for the search.
 */

export const fold = foldText;

/**
 * Filler words. Folding merges words that mean different things ("đăng"/"đang", "tải"/"tài",
 * "cấu"/"cậu", "máy"/"mấy", "thi"/"thì"), so words typed with accents are checked as typed,
 * and only unambiguous words are dropped when typed without accents.
 */
const STOP_ACCENTED = new Set(
  `à ạ ơi nhé nha nhá hả hen ạh vậy thì là của và với cho tôi mình em anh chị bạn cậu tớ ad kai kaned bot thế nào gì sao làm được không ko k có cần muốn hay giúp xin vui lòng
   cách ở đâu trong trên về một những các này đó rồi sẽ đã đang bị nữa thêm tìm kiếm tra cứu xem coi hỏi biết chỉ dùm giùm hộ luôn lun đi ra vào như cái nhiều ít tất cả hết
   mọi bao mấy môn học còn ạ ơi nhỉ chứ đấy đây kìa nè nhờ giùm vs dạy`
    .split(/\s+/)
    .filter(Boolean),
);
const STOP_PLAIN = new Set(
  `a oi nhe nha ha vay cua va voi cho toi minh em anh ban to ad kai kaned bot the nao gi sao lam duoc khong ko k can muon hay giup xin vui long cach o dau trong tren ve mot nhung
   cac nay roi se da bi nua them tim kiem tra cuu xem coi hoi biet chi dum gium ho luon lun di ra vao nhu cai nhieu it tat ca het moi bao mon hoc con nhi chu day nhe nho vs
   please pls plz the of for to in on and or is are what how where which an i me my you your can do does have has want need show list some any get with about`
    .split(/\s+/)
    .filter(Boolean),
);
/** Filler for the help-article index: small on purpose, the idf does the rest. */
export const STOP = new Set(
  `a oi nhe nha ha vay cua va voi cho toi minh em ban the nao gi sao lam duoc khong ko k can muon giup xin vui long o dau trong tren mot nhung cac nay do roi se da bi nua
   hay chi dum gium ho luon di ra nhu cai please the of for to in on and or is are what how where which an i me my you your can do does`
    .split(/\s+/)
    .filter(Boolean),
);
export const isFiller = (low: string, folded: string) => STOP_ACCENTED.has(low) || (low === folded && STOP_PLAIN.has(folded));

export interface Parsed {
  raw: string;
  low: string;
  fold: string;
  subject?: string;
  types: DocumentType[];
  formats: FileFormat[];
  term?: string;
  year?: number;
  wants: Set<AssistantKind>;
  /** Folded keywords for the search, entities and filler removed. */
  keywords: string[];
  /** The same words as typed (with accents), for showing and for the library link. */
  shown: string[];
  howto: boolean;
  searchy: boolean;
  navigate: boolean;
  more: boolean;
  followUp: boolean;
  explain: boolean;
  score10?: number;
  lecturerName?: string;
}

type Rule<T> = { re: RegExp; v: T; on?: 'fold' | 'low' };

/** Longest phrases first: "bài tập lớn" before "bài tập", "đề cương" before "đề". */
const TYPE_RULES: Array<Rule<DocumentType[]>> = [
  { re: /\b(bai tap lon|assignments?|asm|assigment)\b/, v: ['ASSIGNMENT'] },
  { re: /\b(de cuong|on tap|review|cheat ?sheet|tong hop kien thuc)\b/, v: ['REVIEW'] },
  { re: /\b(on thi)\b/, v: ['REVIEW', 'EXAM'] },
  { re: /\b(de thi|de kiem tra|bo de thi|exams?|final ?exam|midterm|practical exam|pe exam|fe exam|test cu)\b/, v: ['EXAM'] },
  { re: /(^|\s)đề(?!\s+cương)(?=\s|$)/, v: ['EXAM'], on: 'low' },
  { re: /\b(bai tap|exercises?|labs?|workshops?|bt)\b/, v: ['EXERCISES'] },
  { re: /\b(slides?|bai giang|powerpoint bai)\b/, v: ['SLIDES'] },
  { re: /\b(ghi chep|ghi chu|notes?|tom tat)\b/, v: ['NOTES'] },
  { re: /\b(giao trinh|textbooks?)\b/, v: ['TEXTBOOK'] },
  { re: /\b(sach|tham khao|references?|ebook)\b/, v: ['BOOK'] },
  { re: /\b(bao cao|reports?)\b/, v: ['REPORT'] },
  { re: /\b(do an|du an|projects?)\b/, v: ['PROJECT'] },
];

const FORMAT_RULES: Array<Rule<FileFormat>> = [
  { re: /\bpdf\b/, v: 'PDF' },
  { re: /\b(word|docx?)\b/, v: 'DOCX' },
  { re: /\b(pptx?|powerpoint)\b/, v: 'PPTX' },
  { re: /\b(excel|xlsx?)\b/, v: 'XLSX' },
  { re: /\b(github|repo|git)\b/, v: 'GITHUB' },
  { re: /\b(markdown|md)\b/, v: 'MD' },
  { re: /\b(draw\.?io|so do drawio)\b/, v: 'DRAWIO' },
];

const DECK_RE = /\b(flash ?cards?|the ghi nho|quizlet|trac nghiem|cau hoi on|bo cau hoi|luyen de|thi thu|bo the)\b/;
const LECTURER_RE = /\b(giang vien|gv|lecturers?|teachers?|can bo|email (cua )?(thay|co))\b/;
const LECTURER_LOW_RE = /(^|\s)(thầy|cô giáo|cô)\s+([\p{L} ]{2,40})/u;
const SUBJECT_RE = /\b(mon hoc|tin chi|dieu kien tien quyet|tien quyet|mon nao)\b/;

const HOWTO_RE =
  /\b(lam sao|lam the nao|the nao|nhu the nao|ra sao|cach|o dau|cho nao|huong dan|chi (minh|toi|em|cach)|la gi|de lam gi|dung de|khong duoc|ko duoc|k duoc|bi loi|loi gi|bao loi|tai sao|vi sao|sao lai|co the|duoc khong|co duoc|nen|how|where|why|what is|guide|tutorial)\b/;
const SEARCH_RE =
  /\b(tim|kiem|search|find|tra|co .{1,40} khong|cho (minh|toi|em|xin)|xin|can|muon|goi y|liet ke|list|nao hay|download|kho)\b/;
const NAV_RE = /\b(mo|di toi|di den|vao trang|chuyen (sang|toi|den)|dua (minh|toi|em) (toi|den|vao)|open|go to|navigate)\b/;
const MORE_RE = /^(xem )?(them|nua|tiep|more|con nua|them nua|xem tiep|trang sau)( di| nua| nhe| nha)?$/;
const FOLLOW_RE = /^(con|the con|vay con|thi sao|con .{1,30} thi sao|.{0,30}(mon (do|nay|tren|vua roi)|cua no))/;
const EXPLAIN_RE = /\b(giai thich|la gi|khac nhau|so sanh|vi du|explain|what is|difference|y nghia|dinh nghia|tai sao|vi sao|cong thuc|viet code|code mau|thuat toan)\b/;

const TERM_RE = /\b(sp|su|fa|spring|summer|fall)\s?'?(?:20)?(\d{2})\b/;
const TERM_VI_RE = /\b(?:ky|hoc ky|hk)\s*(xuan|he|thu)\s*(?:20)?(\d{2})\b/;
const SUBJECT_CODE_RE = /\b([a-z]{2,4})\s?-?\s?(\d{3})([a-z])?\b/;

export function parse(input: string): Parsed {
  const raw = input.trim().slice(0, 500);
  const low = raw.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
  // Words as typed and folded, side by side, so a phrase found in the folded text removes the right words.
  const toks = low
    .replace(/[^\p{L}\p{N}.+#'\s-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter(Boolean)
    .map((w) => ({ low: w, fold: fold(w), gone: false }));
  const fj = toks.map((t) => t.fold).join(' ');
  const starts: number[] = [];
  let pos = 0;
  for (const t of toks) {
    starts.push(pos);
    pos += t.fold.length + 1;
  }
  const f = ` ${fj} `;
  const strip = (re: RegExp) => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of fj.matchAll(g)) {
      const s0 = m.index ?? 0;
      const e0 = s0 + m[0].length;
      toks.forEach((t, i) => {
        const ts = starts[i]!;
        if (ts < e0 && ts + t.fold.length > s0 && m[0].trim()) t.gone = true;
      });
    }
  };

  const p: Parsed = { raw, low, fold: fj, types: [], formats: [], wants: new Set(), keywords: [], shown: [], howto: false, searchy: false, navigate: false, more: false, followUp: false, explain: false };
  p.howto = HOWTO_RE.test(f);
  p.searchy = SEARCH_RE.test(f);
  p.navigate = NAV_RE.test(f) && !/\bmo khoa\b/.test(f);
  p.more = MORE_RE.test(fj);
  p.followUp = FOLLOW_RE.test(fj);
  p.explain = EXPLAIN_RE.test(f);

  // A score to convert: "8.5 là điểm gì", "7,8 hệ 4".
  const sc = /(?:^|\s)(\d{1,2}(?:[.,]\d{1,2})?)(?=\s|$)/.exec(f);
  if (sc && /\b(diem|he 4|he4|diem chu|qua mon|truot|rot|xep loai|thang 4)\b/.test(f) && !/\bgpa\b/.test(f)) {
    const n = Number(sc[1]!.replace(',', '.'));
    if (n >= 0 && n <= 10) p.score10 = n;
  }

  const code = SUBJECT_CODE_RE.exec(f);
  if (code && !/^(sp|su|fa|hk|ky)$/.test(code[1]!)) {
    p.subject = `${code[1]}${code[2]}${code[3] ?? ''}`.toUpperCase();
    strip(new RegExp(code[0].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const tm = TERM_RE.exec(f);
  if (tm) {
    const k = tm[1]!.slice(0, 2) === 'sp' ? 'SP' : tm[1]!.slice(0, 2) === 'su' ? 'SU' : 'FA';
    p.term = `${k}${tm[2]}`;
    strip(TERM_RE);
  } else {
    const tv = TERM_VI_RE.exec(f);
    if (tv) {
      p.term = `${tv[1] === 'xuan' ? 'SP' : tv[1] === 'he' ? 'SU' : 'FA'}${tv[2]}`;
      strip(TERM_VI_RE);
    }
  }
  const yr = /\b(20[12]\d)\b/.exec(f);
  if (yr && !p.term && !/\b20[12]\d\s*[-–]\s*20[12]\d\b/.test(f)) {
    p.year = Number(yr[1]);
    strip(/\b20[12]\d\b/);
  }

  for (const r of TYPE_RULES) {
    if (r.on === 'low') {
      if (r.re.test(low)) {
        for (const t of r.v) if (!p.types.includes(t)) p.types.push(t);
        toks.forEach((t) => {
          if (t.low === 'đề') t.gone = true;
        });
      }
      continue;
    }
    if (r.re.test(f)) {
      for (const t of r.v) if (!p.types.includes(t)) p.types.push(t);
      strip(r.re);
    }
  }
  if (p.types.includes('ASSIGNMENT')) p.types = p.types.filter((t) => t !== 'EXERCISES');
  for (const r of FORMAT_RULES) {
    if (r.re.test(f)) {
      p.formats.push(r.v);
      strip(r.re);
    }
  }

  if (DECK_RE.test(f)) {
    p.wants.add('decks');
    strip(DECK_RE);
  }
  const lect = LECTURER_LOW_RE.exec(low);
  if (lect && !/^(thể|ấy|giáo ơi)/.test(lect[3]!)) {
    p.wants.add('lecturers');
    p.lecturerName = fold(lect[3]!)
      .replace(/\b(day|day mon|o dau|la ai|email|mail|sdt|so dien thoai|lien he|phong|bo mon)\b.*$/, '')
      .trim();
  }
  if (LECTURER_RE.test(f)) {
    p.wants.add('lecturers');
    strip(LECTURER_RE);
  }
  if (SUBJECT_RE.test(f)) p.wants.add('subjects');
  strip(HOWTO_RE);
  // "tài liệu" alone says nothing, but "dữ liệu" does.
  strip(/\b(tai lieu|hoc lieu)\b/);
  strip(/\b(thi sao|the con|con thi|xem them)\b/);

  // What is left, minus filler, is the search.
  // Names ("giảng viên Minh") are often filler words typed without accents: keep them for lecturers.
  const forPeople = p.wants.has('lecturers');
  const kept = toks.filter((t) => !t.gone && !(forPeople ? STOP_ACCENTED.has(t.low) || /^(email|mail|sdt|lien|he|day|o|dau|la|ai)$/.test(t.fold) : isFiller(t.low, t.fold)) && (t.fold.length > 1 || /\d/.test(t.fold)));
  const seen = new Set<string>();
  for (const t of kept) {
    if (seen.has(t.fold)) continue;
    seen.add(t.fold);
    p.keywords.push(t.fold);
    p.shown.push(forPeople ? t.low.charAt(0).toUpperCase() + t.low.slice(1) : t.low);
  }
  if (p.lecturerName) {
    p.keywords = p.lecturerName.split(' ').filter((w) => w.length > 1);
    p.shown = lect ? lect[3]!.trim().split(/\s+/).slice(0, p.keywords.length).map((w) => w.charAt(0).toUpperCase() + w.slice(1)) : p.keywords;
  }
  return p;
}

/* ───────────────────────── BM25 over the help articles ───────────────────────── */

export interface IndexedDoc {
  id: string;
  /** head: title-like fields that say what the article is about (used for coverage). */
  fields: Array<{ text: string; boost: number; head?: boolean }>;
}

const tok = (s: string) =>
  fold(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w));

/** Words plus adjacent pairs, so "phong thi" outranks "phong" and "thi" apart. */
const grams = (words: string[]) => {
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]}_${words[i + 1]}`);
  return out;
};

export class Bm25 {
  private docs: Array<{ id: string; tf: Map<string, number>; len: number; head: Set<string> }> = [];
  private df = new Map<string, number>();
  private avg = 1;
  readonly vocab = new Set<string>();

  constructor(items: IndexedDoc[], private k1 = 1.3, private b = 0.7) {
    for (const it of items) {
      const tf = new Map<string, number>();
      const head = new Set<string>();
      let len = 0;
      for (const f of it.fields) {
        if (f.head) for (const w of tok(f.text)) head.add(w);
        for (const g of grams(tok(f.text))) {
          tf.set(g, (tf.get(g) ?? 0) + f.boost);
          len += 1;
          if (!g.includes('_')) this.vocab.add(g);
        }
      }
      for (const g of tf.keys()) this.df.set(g, (this.df.get(g) ?? 0) + 1);
      this.docs.push({ id: it.id, tf, len, head });
    }
    this.avg = this.docs.reduce((n, d) => n + d.len, 0) / Math.max(1, this.docs.length);
  }

  /** Fixes small typos against the words the articles use ("huong dan" ← "huogn dan"). */
  correct(word: string): string {
    if (this.vocab.has(word) || word.length < 4 || /\d/.test(word)) return word;
    let best = word;
    let bestD = word.length >= 7 ? 2 : 1;
    for (const v of this.vocab) {
      if (Math.abs(v.length - word.length) > bestD) continue;
      const d = damerau(word, v, bestD);
      if (d < bestD || (d === bestD && best === word && d <= (word.length >= 7 ? 2 : 1))) {
        best = v;
        bestD = d;
        if (d === 0) break;
      }
    }
    return best;
  }

  /** score: BM25; coverage: share of the question's words the article contains. */
  search(query: string, limit = 4): Array<{ id: string; score: number; coverage: number }> {
    const words = tok(query).map((w) => this.correct(w));
    const q = grams(words);
    if (!q.length) return [];
    const N = this.docs.length;
    const res = this.docs.map((d) => {
      let s = 0;
      // Coverage weighs each word by how rare it is: "tài liệu" is everywhere, "cấu trúc" is telling.
      let hit = 0;
      let all = 0;
      for (const w of words) {
        const n = this.df.get(w) ?? 0;
        const wt = Math.log(1 + (N + 1) / (n + 0.5));
        all += wt;
        if (d.head.has(w)) hit += wt;
      }
      for (const g of q) {
        const f = d.tf.get(g);
        if (!f) continue;
        const n = this.df.get(g) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        s += (idf * (f * (this.k1 + 1))) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avg)) * (g.includes('_') ? 1.6 : 1);
      }
      return { id: d.id, score: s, coverage: all ? hit / all : 0 };
    });
    return res.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

/** Edit distance with transpositions, giving up beyond `max`. */
export function damerau(a: string, b: string, max = 2): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  const d: number[][] = Array.from({ length: al + 1 }, (_, i) => [i, ...Array<number>(bl).fill(0)]);
  for (let j = 0; j <= bl; j++) d[0]![j] = j;
  for (let i = 1; i <= al; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[al]![bl]!;
}
