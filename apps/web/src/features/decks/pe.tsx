import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ClipboardCopy, Download, FileText, Languages, LayoutTemplate, PenLine, Send, Sparkles, X } from 'lucide-react';
import type { Grade } from '@kaned/shared';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import { qLabel, type StudyPaper, type StudyQuestion } from './model';
import { Frame, RichBody, Solution, tipCoveredBy } from './parts';

/* ─────────────────────────── Languages ─────────────────────────── */

export type Lang = 'both' | 'en' | 'vi';

const PREF_KEY = 'kaned:pe-view';
type PeView = { trans: boolean; frame: boolean };
const readView = (): PeView => {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Partial<PeView>;
    return { trans: v.trans !== false, frame: v.frame === true };
  } catch {
    return { trans: true, frame: false };
  }
};

/** What the PE view shows besides the English statement, remembered on this device. */
export function usePeView() {
  const [view, setView] = useState<PeView>(readView);
  const set = (patch: Partial<PeView>) =>
    setView((v) => {
      const next = { ...v, ...patch };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* private mode: keep it for this visit */
      }
      return next;
    });
  return [view, set] as const;
}

/** A heading line that opens the English or the Vietnamese half of a statement. */
function langMark(line: string): 'en' | 'vi' | null {
  const t = line.trim();
  const inner = /^\*\*([^*]{2,48})\*\*:?$/.exec(t)?.[1] ?? /^#{2,5}\s+(.{2,48})$/.exec(t)?.[1] ?? /^([^*:]{2,30}):$/.exec(t)?.[1];
  if (!inner) return null;
  const s = inner.trim().toLowerCase();
  if (/tiếng việt|vietnamese|dịch đề|bản dịch|^vi$/.test(s)) return 'vi';
  if (/english|tiếng anh|đề gốc|bản gốc|original|^en$/.test(s)) return 'en';
  return null;
}

export interface LangParts {
  /** What comes before the two halves: a title, the exam line. */
  head: string;
  en: string;
  vi: string;
}

/** Splits "**Đề gốc (English)** … **Dịch đề (Tiếng Việt)** …" into its halves, or null if it is not written that way. */
export function splitLang(text: string): LangParts | null {
  const out: Record<'head' | 'en' | 'vi', string[]> = { head: [], en: [], vi: [] };
  let cur: 'head' | 'en' | 'vi' = 'head';
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const k = fence ? null : langMark(line);
    if (k && !out[k].length) {
      cur = k;
      continue;
    }
    out[cur].push(line);
  }
  const en = out.en.join('\n').trim();
  const vi = out.vi.join('\n').trim();
  if (!en || !vi) return null;
  return { head: out.head.join('\n').trim(), en, vi };
}

const paras = (s: string) => s.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);

/** Two switches: the Vietnamese translation, and the frame beside the answer. Off means more room to focus. */
export function PeTools({
  view,
  onChange,
  canTranslate,
  canFrame,
}: {
  view: PeView;
  onChange: (p: Partial<PeView>) => void;
  canTranslate: boolean;
  canFrame: boolean;
}) {
  const item = (on: boolean, label: string, icon: ReactNode, flip: () => void) => (
    <button type="button" className={cn('pe-switch', on && 'is-on')} role="switch" aria-checked={on} onClick={flip}>
      {icon}
      <span>{label}</span>
      <i aria-hidden />
    </button>
  );
  if (!canTranslate && !canFrame) return null;
  return (
    <div className="pe-tools" role="group" aria-label="Hiển thị khi làm bài">
      {canTranslate && item(view.trans, 'Bản dịch', <Languages className="ic ic-sm" />, () => onChange({ trans: !view.trans }))}
      {canFrame && item(view.frame, 'Khung làm bài', <LayoutTemplate className="ic ic-sm" />, () => onChange({ frame: !view.frame }))}
    </div>
  );
}

/**
 * English on the left, Vietnamese on the right. When both halves have the
 * same number of paragraphs, each paragraph sits next to its translation
 * (and on a phone, right under it).
 */
export function Bilingual({ parts, lang }: { parts: LangParts; lang: Lang }) {
  if (lang === 'en') return <RichBody text={parts.en} className="pe-one" />;
  if (lang === 'vi') return <RichBody text={parts.vi} className="pe-one" />;
  const E = paras(parts.en);
  const V = paras(parts.vi);
  const aligned = E.length > 1 && E.length === V.length && !/```|~~~/.test(parts.en);
  return (
    <div className={cn('pe-bi', aligned ? 'is-aligned' : 'is-cols')}>
      <div className="pe-bi-h" aria-hidden>
        <span>English</span>
        <span>Tiếng Việt</span>
      </div>
      {aligned ? (
        E.map((e, i) => (
          <div key={i} className="pe-bi-row">
            <div lang="en">
              <RichBody text={e} />
            </div>
            <div lang="vi" className="pe-vi">
              <RichBody text={V[i]} />
            </div>
          </div>
        ))
      ) : (
        <div className="pe-bi-row">
          <div lang="en">
            <span className="pe-bi-tag">English</span>
            <RichBody text={parts.en} />
          </div>
          <div lang="vi" className="pe-vi">
            <span className="pe-bi-tag">Tiếng Việt</span>
            <RichBody text={parts.vi} />
          </div>
        </div>
      )}
    </div>
  );
}

/** "(2 marks)" in a question title, as a number. */
export function marksOf(text: string): string | null {
  const m = /\((\d+(?:[.,]\d+)?)\s*(?:marks?|điểm|pts?|points?)\)/i.exec(text);
  return m ? m[1].replace(',', '.') : null;
}

/** A PE question: its title line, then the statement in the chosen language. */
export function PeQuestion({ q, lang }: { q: StudyQuestion; lang: Lang }) {
  const parts = splitLang(q.text);
  if (!parts) return <RichBody text={q.text} className="dk-qrich pe-qtext" />;
  const title = parts.head.replace(/^\*\*(.*)\*\*$/s, '$1').replace(/\s*\((\d+(?:[.,]\d+)?)\s*(?:marks?|điểm)\)\s*$/i, '');
  return (
    <div className="pe-q">
      {title && <h2 className="pe-qtitle">{title}</h2>}
      <Bilingual parts={parts} lang={lang} />
    </div>
  );
}

/* ─────────────────────────── The answer ─────────────────────────── */

export type SelfScale = Array<{ g: Grade; label: string; verdict: string; key: string; tone: string }>;

const draftKey = (deck: string, q: string) => `kaned:pe-draft:${deck}:${q}`;
export function loadDraft(deck: string, q: string) {
  try {
    return localStorage.getItem(draftKey(deck, q)) ?? '';
  } catch {
    return '';
  }
}
function saveDraft(deck: string, q: string, v: string) {
  try {
    if (v.trim()) localStorage.setItem(draftKey(deck, q), v);
    else localStorage.removeItem(draftKey(deck, q));
  } catch {
    /* storage full or blocked: the draft stays on screen */
  }
}

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Everything another AI needs to grade one answer: the task, the paper, the question, the frame and the answer. */
export function gradeMarkdown({
  subject,
  deckTitle,
  paper,
  q,
  tips,
  draft,
  scale,
}: {
  subject: string;
  deckTitle: string;
  paper?: StudyPaper;
  q: StudyQuestion;
  tips: Array<{ title: string; body: string }>;
  draft: string;
  scale: SelfScale;
}) {
  const [best, mid, low] = [...scale].sort((a, b) => b.g - a.g).map((c) => c.label);
  const withSolution = Boolean(q.solution);
  const fence = draft.includes('~~~~') ? '~~~~~~' : '~~~~';
  const L: string[] = [
    `# Chấm bài PE: ${subject}, ${paper ? `Đề ${paper.n}, ` : ''}${qLabel(q)}`,
    '',
    `> File do Kaned tạo từ bộ đề “${deckTitle}”. Gửi nguyên file này (hoặc dán toàn bộ nội dung) cho ChatGPT, Gemini hoặc Claude để được chấm, rồi quay lại Kaned chọn đúng mức AI kết luận.`,
    '',
    '## Việc AI cần làm',
    '',
    `Bạn là giám khảo chấm bài thi thực hành (PE) môn ${subject}. Hãy chấm phần **Bài làm của thí sinh** ở cuối file, cho đúng **Câu hỏi** bên dưới, dựa trên **Đề bài** và **${withSolution ? 'Lời giải mẫu' : 'Khung làm bài'}**. Không viết lại cả bài hộ thí sinh và không đưa ra một bài mẫu hoàn chỉnh: chỉ ra chỗ đạt, chỗ thiếu, chỗ sai và cách sửa từng chỗ.`,
    '',
    'Chấm theo 3 tiêu chí:',
    '',
    withSolution
      ? '1. **Đúng nội dung so với lời giải mẫu**: so từng ý, từng bước của lời giải mẫu với bài làm; cách làm khác nhưng đúng vẫn được tính. Đánh dấu mỗi ý là Có, Thiếu hay Sai.'
      : '1. **Đúng cấu trúc và keyword của khung**: liệt kê từng phần, từng keyword bắt buộc trong Khung làm bài (các mục, tiêu đề, công thức, số lượng tối thiểu như “≥ 10 tasks”, “ít nhất 3 objectives”). Đánh dấu mỗi mục là Có, Thiếu hay Sai trong bài làm.',
    '2. **Bám đề**: bài có dùng đúng dữ liệu của đề không (số liệu, tên các bên, ngân sách, thời hạn, phạm vi). Chỉ ra chỗ mâu thuẫn với đề hoặc bịa thêm ngoài đề.',
    '3. **Chính tả và ngữ pháp**: liệt kê từng lỗi chính tả, ngữ pháp, dùng từ, kèm cách sửa. Lỗi nhỏ không làm sai nghĩa thì ghi ra nhưng không hạ mức.',
    '',
    'Sau đó kết luận **đúng một** trong 3 mức:',
    '',
    withSolution
      ? `- **${best}**: đủ mọi ý chính của lời giải mẫu (hoặc cách khác cho kết quả đúng); lỗi ngôn ngữ nếu có không làm sai nghĩa.`
      : `- **${best}**: có đủ mọi phần bắt buộc của khung, đủ số lượng đề yêu cầu, dùng đúng dữ liệu đề; lỗi ngôn ngữ nếu có không làm sai nghĩa.`,
    `- **${mid}**: đúng dạng bài nhưng thiếu ít nhất một phần hoặc keyword bắt buộc, thiếu số lượng, thiếu hoặc sai dữ liệu đề, hoặc lỗi ngôn ngữ làm câu khó hiểu.`,
    `- **${low}**: sai dạng bài, lạc đề, bỏ trống, hoặc thiếu phần lớn ${withSolution ? 'lời giải' : 'khung'}.`,
    '',
    '## Cách trả lời',
    '',
    'Trả lời bằng tiếng Việt, theo đúng thứ tự:',
    '',
    `1. Dòng đầu tiên chỉ ghi: \`KẾT LUẬN: ${best}\`, \`KẾT LUẬN: ${mid}\` hoặc \`KẾT LUẬN: ${low}\`.`,
    `2. Bảng **${withSolution ? 'Nội dung' : 'Cấu trúc và keyword'}**, 3 cột: ${withSolution ? 'Ý trong lời giải' : 'Phần trong khung'} | Bài làm (Có / Thiếu / Sai) | Ghi chú.`,
    '3. **Bám đề**: vài gạch đầu dòng.',
    '4. Bảng **Chính tả và ngữ pháp**, 3 cột: Câu hoặc cụm trong bài | Lỗi | Sửa thành. Không có lỗi thì ghi “Không có lỗi đáng kể”.',
    `5. **Cần làm để đạt “${best}”**: tối đa 5 việc cụ thể. Bỏ mục này nếu đã đạt.`,
    '',
    '---',
    '',
  ];
  if (paper) L.push(`## Đề bài: Đề ${paper.n}, ${paper.title}`, '', paper.body.trim(), '');
  L.push(`## Câu hỏi: ${qLabel(q)}`, '', q.text.trim(), '');
  if (q.frame) L.push('## Khung làm bài', '', q.frame.trim(), '');
  for (const t of tips) L.push(`## Mẹo kèm theo: ${t.title}`, '', t.body.trim(), '');
  if (q.solution) L.push('## Lời giải mẫu (để đối chiếu, không bắt buộc giống từng chữ)', '', q.solution.trim(), '');
  L.push('## Bài làm của thí sinh', '', `${fence}text`, draft.replace(/\s+$/, ''), fence, '');
  return L.join('\n');
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const AI_LINKS: Array<[string, string]> = [
  ['ChatGPT', 'https://chatgpt.com/'],
  ['Gemini', 'https://gemini.google.com/app'],
  ['Claude', 'https://claude.ai/new'],
];

/**
 * Write the answer (kept on this device), with the frame open beside it if
 * wanted. "Done" makes a .md file for the learner's own AI to grade; the
 * learner then picks the level the AI gave, and that schedules the review.
 */
export function PeWorkspace({
  q,
  scale,
  revealed,
  onReveal,
  onBack,
  graded,
  onGrade,
  frameOpen,
  onFrame,
}: {
  frameOpen: boolean;
  onFrame: (open: boolean) => void;
  q: StudyQuestion;
  scale: SelfScale;
  revealed: boolean;
  onReveal: () => void;
  onBack: () => void;
  graded?: Grade;
  onGrade: (g: Grade) => void;
}) {
  const { deck, m } = useDeckCtx();
  const [draft, setDraftState] = useState(() => loadDraft(deck.id, q.id));
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const savedTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  const paper = q.paper != null ? m.papers.get(q.paper) : undefined;
  const codey = /```/.test(`${q.text}\n${q.solution ?? ''}\n${q.frame ?? ''}\n${paper?.body ?? ''}`);
  const tips = q.tips
    .map((n) => m.tips.get(n))
    .filter((t): t is NonNullable<typeof t> => Boolean(t) && !tipCoveredBy(t!.body, q.frame));
  const md = () =>
    gradeMarkdown({ subject: deck.subject.code, deckTitle: deck.title, paper, q, tips, draft, scale });
  const fileName = `kaned-cham-${slug(deck.subject.code)}-${paper ? `de${paper.n}-` : ''}cau${slug(q.id)}.md`;
  const share = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  const setDraft = (v: string) => {
    setDraftState(v);
    saveDraft(deck.id, q.id, v);
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1200);
  };
  const finish = () => {
    if (draft.trim()) download(fileName, md());
    onReveal();
  };
  const copy = async () => {
    if (await copyText(md())) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };
  const sendTo = async () => {
    const file = new File([md()], fileName, { type: 'text/markdown' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: fileName });
      else download(fileName, md());
    } catch {
      /* the learner closed the share sheet */
    }
  };

  if (graded) {
    return (
      <div className="pe-after">
        {draft.trim() && (
          <details className="pe-mine">
            <summary>
              <PenLine className="ic ic-sm" />
              Bài làm của bạn <small>{fmtInt(words(draft))} từ</small>
            </summary>
            <pre className={cn('pe-mine-text', codey && 'is-code')}>{draft}</pre>
          </details>
        )}
        <details className="pe-peek">
          <summary>
            <LayoutTemplate className="ic ic-sm" />
            {q.solution ? 'Xem lời giải mẫu' : 'Xem lại khung làm bài'}
          </summary>
          {q.solution ? <Solution q={q} /> : <Frame q={q} title="Khung làm bài" />}
        </details>
      </div>
    );
  }

  if (revealed) {
    const hasDraft = Boolean(draft.trim());
    return (
      <div className="pe-grade">
        {hasDraft ? (
          <section className="pe-step">
            <header>
              <span className="pe-step-n">1</span>
              <div>
                <h3>Nhờ AI của bạn chấm bài</h3>
                <p>
                  Kaned đã tải về file <b>{fileName}</b>, gồm đề, câu hỏi, {q.solution ? 'lời giải mẫu' : 'khung làm bài'} và bài làm của bạn, kèm yêu cầu chấm chính tả, ngữ pháp và đối chiếu keyword. Gửi file
                  (hoặc dán nội dung) vào ChatGPT, Gemini hay Claude.
                </p>
              </div>
            </header>
            <div className="pe-step-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
                {copied ? <Check className="ic ic-sm" /> : <ClipboardCopy className="ic ic-sm" />}
                {copied ? 'Đã sao chép' : 'Sao chép nội dung'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(fileName, md())}>
                <Download className="ic ic-sm" />
                Tải lại file .md
              </button>
              {share && (
                <button type="button" className="btn btn-secondary btn-sm pe-share" onClick={sendTo}>
                  <Send className="ic ic-sm" />
                  Gửi sang ứng dụng AI
                </button>
              )}
              <span className="pe-ai-links">
                Mở
                {AI_LINKS.map(([n, href]) => (
                  <a key={n} href={href} target="_blank" rel="noreferrer noopener">
                    {n}
                  </a>
                ))}
              </span>
            </div>
          </section>
        ) : (
          <section className="pe-step is-empty">
            <header>
              <span className="pe-step-n">!</span>
              <div>
                <h3>Bạn chưa viết bài</h3>
                <p>Không có bài làm nên Kaned chưa tạo file cho AI chấm. Bạn có thể quay lại viết, hoặc tự đối chiếu với {q.solution ? 'lời giải' : 'khung'} rồi chọn mức.</p>
              </div>
            </header>
          </section>
        )}

        <section className="pe-step">
          <header>
            <span className="pe-step-n">{hasDraft ? '2' : '✓'}</span>
            <div>
              <h3>{hasDraft ? 'Chọn đúng mức AI kết luận' : q.solution ? 'So với lời giải, bạn làm được đến đâu?' : 'So với khung, bài của bạn đủ ý chưa?'}</h3>
              <p>
                {scale[0].label} thì câu này giãn lịch ôn; {scale[2].label.toLowerCase()} thì quay lại sớm.
              </p>
            </div>
          </header>
          <div className="dk-conf-row pe-scale" role="group" aria-label="Kết quả chấm">
            {scale.map((c) => (
              <button key={c.g} type="button" className={cn('dk-conf-btn', c.tone)} onClick={() => onGrade(c.g)}>
                <kbd>{c.key}</kbd>
                {c.label}
              </button>
            ))}
          </div>
        </section>

        <div className="pe-grade-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            <PenLine className="ic ic-sm" />
            Sửa tiếp bài làm
          </button>
          <details className="pe-peek">
            <summary>
              <LayoutTemplate className="ic ic-sm" />
              {q.solution ? 'Xem lời giải mẫu' : 'Xem khung để tự đối chiếu'}
            </summary>
            {q.solution ? <Solution q={q} /> : <Frame q={q} title="Khung làm bài" />}
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('pe-work', frameOpen && q.frame && 'has-frame')}>
      <div className="pe-editor">
        <div className="pe-editor-bar">
          <label htmlFor={`pe-draft-${q.id}`}>
            <PenLine className="ic ic-sm" />
            Bài làm
          </label>
          <span className="pe-meta" aria-live="polite">
            {fmtInt(words(draft))} từ
            <span className={cn('pe-saved', saved && 'is-on')}>{draft.trim() ? 'đã lưu trên máy này' : ''}</span>
          </span>
          <span className="spacer" />
          {q.frame && !frameOpen && (
            <button type="button" className="btn btn-ghost btn-sm pe-frame-toggle" onClick={() => onFrame(true)}>
              <LayoutTemplate className="ic ic-sm" />
              Xem khung
            </button>
          )}
        </div>
        <textarea
          id={`pe-draft-${q.id}`}
          ref={area}
          className={cn(codey && 'is-code')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={!codey}
          lang="en"
          placeholder={codey ? 'Viết code hoặc các bước làm…' : 'Viết bài bằng tiếng Anh như khi đi thi. Bài tự lưu trên máy này.'}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault();
              const t = e.currentTarget;
              const a = t.selectionStart;
              const v = `${t.value.slice(0, a)}  ${t.value.slice(t.selectionEnd)}`;
              setDraft(v);
              requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
            }
          }}
        />
        <div className="pe-submit">
          <button type="button" className="btn btn-primary" onClick={finish}>
            <Sparkles className="ic ic-sm" />
            Làm xong, tự chấm
          </button>
          <p>
            <FileText className="ic ic-xs" />
            {draft.trim() ? 'Kaned tạo file .md để bạn nhờ AI chấm, rồi bạn chọn mức.' : 'Viết bài để Kaned tạo file cho AI chấm, hoặc tự chấm luôn.'}
          </p>
        </div>
      </div>
      {frameOpen && q.frame && (
        <aside className="pe-frame-pane dk-frame" aria-label="Khung làm bài">
          <div className="dk-tip-h pe-frame-h">
            <LayoutTemplate className="ic ic-sm" />
            Khung làm bài
            <span className="spacer" />
            <button type="button" className="icon-btn pe-frame-x" aria-label="Ẩn khung làm bài" data-tip="Ẩn khung" onClick={() => onFrame(false)}>
              <X className="ic ic-sm" />
            </button>
          </div>
          <RichBody text={q.frame} />
        </aside>
      )}
    </div>
  );
}
