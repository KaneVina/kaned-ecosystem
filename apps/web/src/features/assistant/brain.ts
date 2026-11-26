import {
  CLASSIFICATIONS,
  DOCUMENT_TYPE_LABELS,
  GRADE_SCALE,
  classify,
  gradeBandFor,
  isPassing,
  isWeakPass,
  type AssistantDeckHit,
  type AssistantDocHit,
  type AssistantLecturerHit,
  type AssistantSearchQuery,
  type AssistantSearchResult,
  type AssistantSubjectHit,
  type DocumentType,
} from '@kaned/shared';
import { KB, KB_BY_ID, type KbAction, type KbArticle } from './kb';
import { Bm25, fold, parse, type Parsed } from './nlp';

/* ───────────────────────────── replies ───────────────────────────── */

export type Mood = 'idle' | 'happy' | 'think' | 'sorry' | 'wave' | 'talk';

export type Block =
  | { k: 'text'; md: string }
  | { k: 'steps'; items: string[] }
  | { k: 'actions'; items: KbAction[] }
  | { k: 'understood'; items: string[] }
  | { k: 'docs'; items: AssistantDocHit[]; total: number; more?: KbAction }
  | { k: 'decks'; items: AssistantDeckHit[] }
  | { k: 'subjects'; items: AssistantSubjectHit[] }
  | { k: 'lecturers'; items: AssistantLecturerHit[] }
  | { k: 'grade'; score10: number; letter: string; gpa4: number; label: string; pass: boolean; weak: boolean }
  | { k: 'llm'; text: string; done: boolean; model: string; error?: string }
  | { k: 'note'; md: string };

export interface Reply {
  blocks: Block[];
  chips?: string[];
  mood?: Mood;
  /** Open this page right away ("mở trang GPA"). */
  navigate?: string;
  kind: 'kb' | 'search' | 'small' | 'grade' | 'nav' | 'fallback' | 'llm';
  /** For feedback: which article answered. */
  articleId?: string;
}

export interface Ctx {
  lastSubject?: string;
  lastTypes?: DocumentType[];
  lastQuery?: AssistantSearchQuery;
  lastKeywords?: string[];
  userName?: string;
  path: string;
}

export interface Deps {
  search: (q: AssistantSearchQuery) => Promise<AssistantSearchResult>;
  /** Present when the on-device model is ready. Streams tokens through onToken. */
  llm?: {
    model: string;
    generate: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, onToken: (text: string) => void) => Promise<string>;
  };
  /** Recent turns, for the model's memory. */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/* ───────────────────────────── the index ───────────────────────────── */

let index: Bm25 | null = null;
function kbIndex() {
  if (!index) {
    index = new Bm25(
      KB.map((a) => ({
        id: a.id,
        fields: [
          { text: a.title, boost: 3, head: true },
          { text: a.q.join(' . '), boost: 2.2, head: true },
          { text: a.kw, boost: 1.6, head: true },
          { text: (a.nav ?? []).join(' . '), boost: 1.5, head: true },
          { text: a.a.replace(/\*\*/g, ''), boost: 0.6 },
          { text: (a.steps ?? []).join(' '), boost: 0.5 },
        ],
      })),
    );
  }
  return index;
}

/* ───────────────────────────── helpers ───────────────────────────── */

const TYPE_VI = (t: DocumentType) => DOCUMENT_TYPE_LABELS[t]?.vi ?? t;
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;
const fmt1 = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

function gradeScaleMd() {
  const rows = GRADE_SCALE.map((b, i) => {
    const hi = i === 0 ? 10 : GRADE_SCALE[i - 1]!.min - 0.1;
    return `- **${b.letter}** (${fmt1(b.min)}–${fmt1(hi)}): hệ 4 = **${fmt1(b.gpa4)}**, ${b.labelVi}`;
  });
  const cls = CLASSIFICATIONS.map((c) => `${c.vi} từ ${fmt1(c.min)}`).join(', ');
  return `Thang quy đổi Kaned đang dùng:\n${rows.join('\n')}\n\nQua môn từ **4,0**. Xếp loại GPA hệ 4: ${cls}.`;
}

function articleReply(a: KbArticle, opts: { lead?: string } = {}): Reply {
  const blocks: Block[] = [];
  const body = a.a === '__GRADE_SCALE__' ? gradeScaleMd() : a.a;
  blocks.push({ k: 'text', md: `${opts.lead ? `${opts.lead}\n\n` : ''}${body}` });
  if (a.steps?.length) blocks.push({ k: 'steps', items: a.steps });
  if (a.actions?.length) blocks.push({ k: 'actions', items: a.actions });
  const chips = (a.related ?? []).map((id) => KB_BY_ID.get(id)?.title).filter(Boolean) as string[];
  return { blocks, chips, mood: 'happy', kind: 'kb', articleId: a.id };
}

function libraryLink(q: AssistantSearchQuery, res: AssistantSearchResult): KbAction {
  const sp = new URLSearchParams();
  if (res.subjectIds.length) sp.set('subjectId', res.subjectIds.join(','));
  const types = Array.isArray(q.types) ? q.types : q.types ? String(q.types).split(',') : [];
  if (types.length) sp.set('type', types.join(','));
  if (q.q) sp.set('q', q.q);
  if (q.year) sp.set('year', String(q.year));
  return { label: `Xem tất cả ${res.docs.total}${res.docs.capped ? '+' : ''} trong Thư viện`, to: `/app/library${sp.toString() ? `?${sp}` : ''}` };
}

/* ───────────────────────────── small talk ───────────────────────────── */

const SMALL: Array<{ re: RegExp; reply: (ctx: Ctx) => Reply }> = [
  {
    re: /^(xin chao|chao|hello|hi|hey|alo|yo|chao kai|hi kai|hello kai|chao ban|kai oi|e kai|ê|ê kai|chao buoi (sang|trua|chieu|toi))( (ban|kai|nhe|nha|a|ad))*$/,
    reply: (c) => ({
      kind: 'small',
      mood: 'wave',
      blocks: [{ k: 'text', md: `Chào ${c.userName ? `**${c.userName.split(' ').slice(-1)[0]}**` : 'bạn'}! Mình là **Kai**. Bạn muốn tìm tài liệu cho môn nào, hay cần mình chỉ cách dùng tính năng nào?` }],
      chips: ['Tìm đề thi PRM393', 'Cách đăng tài liệu', 'Vào phòng thi thế nào?', '8.5 là điểm gì?'],
    }),
  },
  { re: /^(cam on|thanks|thank you|thank|tks|thanks kai|cam on kai|cam on ban|ok cam on|oke cam on)( (nhieu|nhe|nha|a|ban|kai))*$/, reply: () => ({ kind: 'small', mood: 'happy', blocks: [{ k: 'text', md: pick(['Không có gì! Cần gì cứ gọi mình nhé.', 'Rất vui được giúp bạn. Học tốt nha!', 'Có gì khó cứ hỏi Kai nhé!']) }] }) },
  { re: /^(bye|tam biet|bai|goodbye|see you|hen gap lai|di day)( (nhe|nha|kai|ban))*$/, reply: () => ({ kind: 'small', mood: 'wave', blocks: [{ k: 'text', md: 'Chúc bạn học tốt! Mình ở góc màn hình khi bạn cần.' }] }) },
  { re: /^(ban (co )?khoe khong|khoe khong|how are you|ban the nao)/, reply: () => ({ kind: 'small', mood: 'happy', blocks: [{ k: 'text', md: 'Mình khoẻ, đang chạy mượt ngay trên máy bạn. Còn bạn, hôm nay ôn môn gì?' }], chips: ['Thẻ đến hạn hôm nay', 'Tìm đề thi'] }) },
  { re: /^(ok|oke|okay|uh|um|uhm|vang|da|u|ừ|dc|duoc roi|hieu roi|good|tot|hay|tuyet|great|nice)$/, reply: () => ({ kind: 'small', mood: 'happy', blocks: [{ k: 'text', md: pick(['Tuyệt! Còn gì mình giúp được không?', 'Ok nè. Bạn cần tìm gì tiếp?']) }] }) },
  {
    re: /^(ban|kai|cau)? ?(la ai|co the lam (duoc )?(gi|nhung gi)|lam duoc (gi|nhung gi)|giup (duoc )?(gi|nhung gi)( cho (minh|toi|em))?|biet lam gi)$|\b(who are you|what can you do)\b/,
    reply: () => articleReply(KB_BY_ID.get('kai')!),
  },
  {
    re: /\b(ke chuyen cuoi|joke|noi gi vui|chan qua|buon qua|met qua)\b/,
    reply: () => ({
      kind: 'small',
      mood: 'happy',
      blocks: [{ k: 'text', md: pick([
        'Vì sao lập trình viên hay nhầm Halloween với Giáng sinh? Vì **Oct 31 = Dec 25**.',
        'Sinh viên hỏi: "Thầy ơi đề có khó không?" Thầy: "Không khó, chỉ là **chưa ôn** thôi em."',
        'Mình có một câu đùa về UDP, nhưng không chắc bạn có nhận được không.',
        'Mệt thì nghỉ 5 phút nhé. Sau đó mở **Lật thẻ**, 10 thẻ thôi là thấy có tiến bộ rồi.',
      ]) }],
    }),
  },
  {
    re: /\b(may gio|bay gio la|hom nay (la )?(ngay|thu) (may|gi)|ngay bao nhieu|what time|today)\b/,
    reply: () => {
      const d = new Date();
      const s = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
      return { kind: 'small', mood: 'happy', blocks: [{ k: 'text', md: `Bây giờ là **${s}** (giờ Việt Nam).` }] };
    },
  },
];

/* ───────────────────────────── the brain ───────────────────────────── */

const SYSTEM = (ctx: Ctx, grounding: string) =>
  `Bạn là Kai, trợ lý học tập thân thiện của Kaned (nền tảng chia sẻ tài liệu, thẻ ghi nhớ, tính GPA, phòng thi ảo cho sinh viên Việt Nam).
Luôn trả lời bằng tiếng Việt, ngắn gọn (tối đa khoảng 180 chữ), rõ ràng; dùng gạch đầu dòng khi liệt kê, **in đậm** ý chính, khối \`\`\` cho mã.
Về tính năng Kaned: chỉ dựa vào NGỮ CẢNH; không bịa tên nút, đường dẫn hay con số. Không biết thì nói là chưa chắc.
Về kiến thức học thuật: giải thích chính xác, có ví dụ ngắn; nếu bài tập là đề thi đang diễn ra thì từ chối làm hộ, chỉ gợi ý hướng làm.
${ctx.userName ? `Người dùng tên ${ctx.userName}.` : ''}
NGỮ CẢNH:
${grounding || '(không có)'}`;

export async function respond(text: string, ctx: Ctx, deps: Deps, emit: (r: Reply) => void): Promise<{ reply: Reply; ctx: Ctx }> {
  const p = parse(text);
  const next: Ctx = { ...ctx };
  if (!p.fold) return { reply: { kind: 'small', blocks: [] }, ctx };

  // 0. A suggestion chip that names an article.
  const exact = KB.find((a) => fold(a.title).replace(/[?:]/g, '').trim() === p.fold.replace(/[?:]/g, '').trim());
  if (exact) return { reply: articleReply(exact), ctx };

  // 1. Small talk
  for (const s of SMALL) if (s.re.test(p.fold)) return { reply: s.reply(ctx), ctx };

  // 2. A score or a GPA to read
  const gpaCls = /\bgpa\b/.test(p.fold) && /\b(xep loai|loai gi|bang gi|bang loai|hoc luc)\b/.test(p.fold) ? /(\d(?:[.,]\d{1,2})?)/.exec(p.fold) : null;
  if (gpaCls) {
    const g = Number(gpaCls[1]!.replace(',', '.'));
    if (g >= 0 && g <= 4) {
      const c = classify(g);
      return { reply: { kind: 'grade', mood: 'happy', blocks: [{ k: 'text', md: `GPA **${fmt1(g)}** trên hệ 4 xếp loại **${c.vi}**.` }], chips: ['Thang điểm chữ và hệ 4', 'Tính GPA'] }, ctx };
    }
  }
  if (p.score10 != null) {
    const b = gradeBandFor(p.score10);
    return {
      reply: {
        kind: 'grade',
        mood: isPassing(p.score10) ? 'happy' : 'sorry',
        blocks: [
          { k: 'grade', score10: p.score10, letter: b.letter, gpa4: b.gpa4, label: b.labelVi, pass: isPassing(p.score10), weak: isWeakPass(p.score10) },
          { k: 'actions', items: [{ label: 'Tính GPA cả kỳ', to: '/app/tools/gpa' }] },
        ],
        chips: ['Thang điểm chữ và hệ 4', 'Cần bao nhiêu điểm để đạt GPA mục tiêu?'],
      },
      ctx,
    };
  }

  const kb = kbIndex().search(p.raw, 4);
  const top = kb[0];
  const topArt = top ? KB_BY_ID.get(top.id) : undefined;

  // 3. "Mở trang …"
  if (p.navigate && !p.subject && !p.types.length) {
    const target = navTarget(p);
    if (target) {
      return {
        reply: { kind: 'nav', mood: 'happy', navigate: target.route, blocks: [{ k: 'text', md: `Đang mở **${target.title.replace(/\?$/, '')}** cho bạn…` }, { k: 'actions', items: target.actions ?? [] }], chips: (target.related ?? []).map((id) => KB_BY_ID.get(id)!.title) },
        ctx,
      };
    }
  }

  // 4. Follow-ups reuse what we were talking about.
  if (p.more && ctx.lastQuery) {
    const q = { ...ctx.lastQuery, limit: 12 };
    return { reply: await searchReply(q, p, deps, true), ctx };
  }
  const subject = p.subject ?? (p.followUp || (!p.howto && (p.types.length || p.wants.has('decks')) && !p.keywords.length) ? ctx.lastSubject : undefined);

  // Specific things to find (a subject, a type…) versus a soft wish (flashcards, lecturers in general).
  const strongEntity = Boolean(p.subject || p.types.length || p.formats.length || p.term || p.lecturerName || (p.wants.has('lecturers') && p.keywords.length && !p.howto));
  const kbOk = top ? top.score >= 3.2 && top.coverage >= 0.34 : false;
  const kbStrong = top ? top.score >= 6 && top.coverage >= 0.6 : false;

  // 4b. Knowledge questions ("SQL JOIN là gì") are not about Kaned: model if on, else documents on the topic.
  if (p.explain && !kbStrong && !strongEntity) {
    if (deps.llm) return { reply: await llmReply(p, ctx, deps, emit), ctx: next };
    if (p.keywords.length) {
      const r = await searchReply({ q: p.shown.join(' '), kinds: 'docs,decks', limit: 4 }, p, deps, false);
      const tip: Block = { k: 'note', md: 'Muốn mình **giải thích** luôn? Bật **AI sâu** (nút ✦ trên đầu khung chat): mô hình chạy ngay trên máy bạn.' };
      if (r.kind === 'search') {
        r.blocks = [{ k: 'text', md: `Mình tìm được tài liệu về **${p.shown.join(' ')}** trong Kaned:` }, ...r.blocks.filter((b) => b.k !== 'text' && b.k !== 'understood'), tip];
        return { reply: r, ctx: next };
      }
    }
    return { reply: fallback(p, kb), ctx: next };
  }

  // 5. How-to questions about Kaned: the help article (plus results when they named a subject and a type).
  if (p.howto && kbOk && topArt && (!strongEntity || kbStrong)) {
    const r = articleReply(topArt);
    if (p.subject && (p.types.length || p.wants.has('decks'))) {
      const s = await searchReply(buildQuery(p, subject), p, deps, false);
      r.blocks.push(...s.blocks.filter((b) => b.k !== 'text' && b.k !== 'understood'));
      next.lastSubject = p.subject;
    }
    return { reply: withAlternatives(r, kb), ctx: next };
  }

  const remember = (q: AssistantSearchQuery) => {
    next.lastQuery = q;
    if (subject) next.lastSubject = subject;
    if (p.types.length) next.lastTypes = p.types;
    next.lastKeywords = p.keywords;
  };

  // 6. The question names what to find: search.
  if (strongEntity) {
    const q = buildQuery(p, subject);
    const r = await searchReply(q, p, deps, false);
    remember(q);
    if (r.kind === 'fallback' && deps.llm && p.explain) return { reply: await llmReply(p, ctx, deps, emit, r), ctx: next };
    return { reply: r, ctx: next };
  }

  // 7. A help article that clearly fits.
  if (kbStrong && topArt) return { reply: withAlternatives(articleReply(topArt), kb), ctx: next };

  // 7b. "flashcard SQL", "giảng viên Hùng": the soft wish still searches.
  if (p.wants.size && !p.howto) {
    const q = buildQuery(p, subject);
    const r = await searchReply(q, p, deps, false);
    remember(q);
    return { reply: r, ctx: next };
  }

  // 8. Words left: the library first, then the closest article, then the model.
  if (p.keywords.length) {
    const q = buildQuery(p, subject);
    const r = await searchReply(q, p, deps, false);
    if (r.kind === 'search') {
      remember(q);
      if (kbOk && topArt && top!.coverage >= 0.5) r.chips = [...new Set([topArt.title, ...(r.chips ?? [])])].slice(0, 4);
      return { reply: r, ctx: next };
    }
  }
  if (kbOk && topArt) return { reply: withAlternatives(articleReply(topArt, { lead: 'Có phải bạn hỏi về điều này?' }), kb), ctx: next };
  if (deps.llm) return { reply: await llmReply(p, ctx, deps, emit), ctx: next };
  return { reply: fallback(p, kb), ctx: next };
}

function withAlternatives(r: Reply, kb: Array<{ id: string; score: number }>): Reply {
  const best = kb[0]?.score ?? 0;
  const others = kb.slice(1).filter((x) => x.score >= Math.max(2.5, best * 0.55) && x.id !== r.articleId).map((x) => KB_BY_ID.get(x.id)!.title);
  const chips = [...new Set([...(r.chips ?? []), ...others])].slice(0, 4);
  return { ...r, chips };
}

function navTarget(p: Parsed): KbArticle | undefined {
  const f = p.fold;
  let best: { a: KbArticle; len: number } | undefined;
  for (const a of KB) {
    if (!a.route) continue;
    for (const n of a.nav ?? []) {
      const nf = fold(n);
      if (f.includes(nf) && (!best || nf.length > best.len)) best = { a, len: nf.length };
    }
  }
  return best?.a;
}

function buildQuery(p: Parsed, subject?: string): AssistantSearchQuery {
  const kinds = new Set<string>(['docs', 'decks', 'subjects']);
  if (p.wants.has('lecturers')) kinds.add('lecturers');
  // Only lecturers asked for: do not drown them in documents.
  if (p.wants.has('lecturers') && !p.types.length && !subject) {
    kinds.delete('docs');
    kinds.delete('decks');
    kinds.delete('subjects');
  }
  // "flashcard PRM393": decks first; documents only when there is no deck.
  if (p.wants.has('decks') && !p.types.length) {
    kinds.delete('subjects');
    kinds.delete('docs');
  }
  return {
    q: p.shown.join(' ') || undefined,
    subject,
    types: p.types.join(',') || undefined,
    formats: p.formats.join(',') || undefined,
    term: p.term,
    year: p.year,
    kinds: [...kinds].join(','),
    limit: 5,
  };
}

async function searchReply(q: AssistantSearchQuery, p: Parsed, deps: Deps, more: boolean): Promise<Reply> {
  let res: AssistantSearchResult;
  try {
    res = await deps.search(q);
  } catch {
    return { kind: 'fallback', mood: 'sorry', blocks: [{ k: 'text', md: 'Mình chưa kết nối được tới Thư viện. Kiểm tra mạng rồi hỏi lại nhé.' }] };
  }
  const types = (Array.isArray(q.types) ? q.types : q.types ? String(q.types).split(',') : []) as DocumentType[];
  const understood: string[] = [];
  if (res.subject) understood.push(`Môn ${res.subject.code}`);
  else if (q.subject) understood.push(`Mã môn ${q.subject}`);
  for (const t of types) understood.push(TYPE_VI(t));
  if (q.term) understood.push(`Kỳ ${q.term}`);
  if (q.year) understood.push(`Năm ${q.year}`);
  if (q.formats) understood.push(String(q.formats));
  if (q.q) understood.push(`“${q.q}”`);

  const blocks: Block[] = [];
  if (understood.length) blocks.push({ k: 'understood', items: understood });
  const subjName = res.subject ? `**${res.subject.code}** – ${res.subject.nameVi || res.subject.name}` : '';
  const what = types.length ? types.map((t) => TYPE_VI(t).toLowerCase()).join(', ') : 'tài liệu';

  if (q.subject && !res.subject) {
    blocks.push({ k: 'text', md: `Mình chưa thấy môn **${q.subject}** trong Kaned. Bạn kiểm tra lại mã môn, hoặc gõ tên môn để mình tìm.` });
    if (res.subjects.length) blocks.push({ k: 'subjects', items: res.subjects });
    return { kind: 'fallback', mood: 'sorry', blocks, chips: ['Môn học & điều kiện tiên quyết', 'Cách đăng tài liệu'] };
  }

  const total = res.docs.total;
  let any = Boolean(total || res.decks.length || res.lecturers.length || res.subjects.length);
  if (total) {
    blocks.push({ k: 'text', md: more ? `Đây là thêm kết quả cho bạn (${total}${res.docs.capped ? '+' : ''} ${what}):` : `Mình tìm thấy **${total}${res.docs.capped ? '+' : ''} ${what}**${subjName ? ` môn ${subjName}` : ''}. Phù hợp nhất:` });
    blocks.push({ k: 'docs', items: res.docs.items, total, more: total > res.docs.items.length ? libraryLink(q, res) : undefined });
  } else if (res.lecturers.length || res.lecturersNeedLogin) {
    // lecturers only
  } else if ((types.length || q.subject || q.q) && kindsOf(q).includes('docs')) {
    // None of that type: what else is there on the same subject or words?
    const wider = types.length && (q.q || q.subject) ? await deps.search({ ...q, types: undefined, kinds: 'docs', limit: 4 }).catch(() => null) : null;
    if (wider?.docs.items.length) {
      any = true;
      blocks.push({ k: 'text', md: `Chưa có ${what} nào${subjName ? ` cho môn ${subjName}` : ''}${q.q ? ` khớp “${q.q}”` : ''}, nhưng có **${wider.docs.total} tài liệu khác**:` });
      blocks.push({ k: 'docs', items: wider.docs.items, total: wider.docs.total, more: wider.docs.total > wider.docs.items.length ? libraryLink({ ...q, types: undefined }, wider) : undefined });
    } else {
      const tries = [q.q && 'bớt từ khoá', types.length && 'chọn loại tài liệu khác'].filter(Boolean).join(' hoặc ');
      blocks.push({ k: 'text', md: `Chưa có ${what} nào${subjName ? ` cho môn ${subjName}` : ''}${q.q ? ` khớp “${q.q}”` : ''}.${tries ? ` Thử ${tries}.` : ''} Nếu bạn có, **đăng lên** giúp các bạn khác nhé.` });
    }
  }
  const kindsAsked = kindsOf(q);
  if (!res.decks.length && kindsAsked.includes('decks') && !kindsAsked.includes('docs')) {
    // No deck: documents on the same thing are the next best help.
    const alt = q.q || q.subject ? await deps.search({ ...q, kinds: 'docs', limit: 4 }).catch(() => null) : null;
    if (alt?.docs.items.length) {
      blocks.push({ k: 'text', md: `Chưa có bộ thẻ ghi nhớ${subjName ? ` cho môn ${subjName}` : ''}, nhưng có **${alt.docs.total} tài liệu** liên quan:` });
      blocks.push({ k: 'docs', items: alt.docs.items, total: alt.docs.total, more: alt.docs.total > alt.docs.items.length ? libraryLink(q, alt) : undefined });
      return { kind: 'search', mood: 'happy', blocks, chips: ['Thẻ ghi nhớ (flashcard)', 'Cách đăng tài liệu'] };
    }
    blocks.push({ k: 'text', md: `Chưa có bộ thẻ ghi nhớ nào${subjName ? ` cho môn ${subjName}` : ''}.` });
  }
  if (res.decks.length) {
    if (!total) blocks.push({ k: 'text', md: subjName ? `Môn ${subjName} có bộ thẻ ghi nhớ để luyện:` : 'Có bộ thẻ ghi nhớ phù hợp:' });
    blocks.push({ k: 'decks', items: res.decks });
  }
  if (res.lecturers.length) {
    blocks.push({ k: 'text', md: `Giảng viên khớp “${q.q || p.lecturerName}”:` });
    blocks.push({ k: 'lecturers', items: res.lecturers });
  } else if (res.lecturersNeedLogin) {
    blocks.push({ k: 'note', md: 'Tra cứu giảng viên cần **đăng nhập**.' });
  } else if (p.wants.has('lecturers') && !res.lecturers.length) {
    blocks.push({ k: 'text', md: `Mình không thấy giảng viên nào khớp “${q.q || p.lecturerName || ''}”. Thử gõ họ tên đầy đủ hoặc email.` });
    blocks.push({ k: 'actions', items: [{ label: 'Mở Tra cứu giảng viên', to: '/app/lecturers' }] });
  }
  if (res.subjects.length && (!total || p.wants.has('subjects')) && !res.decks.length) {
    if (!total) blocks.push({ k: 'text', md: 'Môn học liên quan:' });
    blocks.push({ k: 'subjects', items: res.subjects });
  }
  if (!total && !res.decks.length && (types.length || q.subject)) blocks.push({ k: 'actions', items: [{ label: 'Đăng tài liệu', to: '/app/upload' }, ...(res.subject ? [{ label: `Xem môn ${res.subject.code}`, to: `/app/subjects/${res.subject.code}` }] : [])] });

  const code = res.subject?.code;
  const chips: string[] = [];
  if (code) {
    for (const [t, label] of [['EXAM', 'Đề thi'], ['SLIDES', 'Slide'], ['EXERCISES', 'Bài tập'], ['REVIEW', 'Đề cương ôn tập']] as const) if (!types.includes(t)) chips.push(`${label} ${code}`);
    if (!res.decks.length) chips.push(`Flashcard ${code}`);
  }
  if (total > res.docs.items.length && !more) chips.unshift('Xem thêm');
  if (!any) return { kind: 'fallback', mood: 'sorry', blocks, chips: chips.length ? chips.slice(0, 4) : ['Cách tìm tài liệu trong Thư viện', 'Cách đăng tài liệu'] };
  return { kind: 'search', mood: 'happy', blocks, chips: chips.slice(0, 4) };
}

const kindsOf = (q: AssistantSearchQuery) => (Array.isArray(q.kinds) ? q.kinds.join(',') : String(q.kinds ?? 'docs,decks,subjects'));

function fallback(p: Parsed, kb: Array<{ id: string; score: number }>): Reply {
  const sugg = kb.filter((x) => x.score > 1).slice(0, 3).map((x) => KB_BY_ID.get(x.id)!.title);
  return {
    kind: 'fallback',
    mood: 'sorry',
    blocks: [
      {
        k: 'text',
        md: p.explain
          ? 'Câu này là kiến thức chuyên môn, chế độ nhanh của mình chưa giải thích được. Bật **AI sâu** (biểu tượng ✦ trên đầu khung chat) để mình trả lời bằng mô hình chạy ngay trên máy bạn, hoặc tìm tài liệu về chủ đề đó trong Thư viện.'
          : 'Mình chưa hiểu ý bạn lắm. Bạn thử hỏi theo kiểu **"đề thi PRM393"**, **"slide môn SWT301"**, **"cách đăng tài liệu"** hay **"8.5 là điểm gì"** nhé.',
      },
    ],
    chips: sugg.length ? sugg : ['Kaned có những gì?', 'Tìm đề thi', 'Cách đăng tài liệu'],
  };
}

/* ───────────────────────────── the on-device model ───────────────────────────── */

async function llmReply(p: Parsed, ctx: Ctx, deps: Deps, emit: (r: Reply) => void, searchRes?: Reply): Promise<Reply> {
  const llm = deps.llm!;
  const kb = kbIndex().search(p.raw, 2).filter((x) => x.score > 2.5).map((x) => KB_BY_ID.get(x.id)!);
  const grounding = kb.map((a) => `# ${a.title}\n${a.a === '__GRADE_SCALE__' ? gradeScaleMd() : a.a}${a.steps ? `\nCác bước: ${a.steps.join('; ')}` : ''}`).join('\n\n');
  // Documents that may help, found in parallel.
  const docsP = p.keywords.length ? deps.search({ q: p.shown.slice(0, 5).join(' '), kinds: 'docs,decks', limit: 3 }).catch(() => null) : Promise.resolve(null);

  const block: Extract<Block, { k: 'llm' }> = { k: 'llm', text: '', done: false, model: llm.model };
  const reply: Reply = { kind: 'llm', mood: 'talk', blocks: [block] };
  emit({ ...reply, blocks: [{ ...block }] });
  const messages = [
    { role: 'system' as const, content: SYSTEM(ctx, grounding) },
    ...deps.history.slice(-6),
    { role: 'user' as const, content: p.raw },
  ];
  try {
    let last = 0;
    const text = await llm.generate(messages, (t) => {
      block.text = t;
      const now = performance.now();
      if (now - last > 40) {
        last = now;
        emit({ ...reply, blocks: [{ ...block }] });
      }
    });
    block.text = text.trim();
  } catch (e) {
    block.error = (e as Error).message || 'Mô hình gặp lỗi.';
  }
  block.done = true;
  const blocks: Block[] = [{ ...block }];
  const docs = await docsP;
  if (docs && (docs.docs.items.length || docs.decks.length)) {
    blocks.push({ k: 'text', md: 'Tài liệu liên quan trong Kaned:' });
    if (docs.docs.items.length) blocks.push({ k: 'docs', items: docs.docs.items.slice(0, 3), total: docs.docs.total });
    if (docs.decks.length) blocks.push({ k: 'decks', items: docs.decks.slice(0, 2) });
  } else if (searchRes) {
    // keep nothing from the empty search
  }
  return { kind: 'llm', mood: block.error ? 'sorry' : 'happy', blocks, chips: kb.map((a) => a.title).slice(0, 3) };
}

export function kbTitles() {
  return KB.map((a) => a.title);
}
