import { Fragment, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Typewriter } from '@/components/ui/Typewriter';
import { ArrowDownUp, BookOpenCheck, LayoutTemplate, ChevronDown, ChevronUp, Copy, FileCode2, Flame, Lightbulb, ListChecks, Maximize2, Minimize2, Shuffle, TriangleAlert } from 'lucide-react';
import type { DeckQuestion } from '@kaned/shared';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import { chapterTitle, matchesTermFilter, parseTermFilter, termFilterKey } from '@kaned/shared';
import { Bilingual, splitLang, type Lang } from './pe';
import { countsOf, highlight, makeStatus, NO_SLICE, sliceActive, type Order, type Scope, type Slice, type StudyQuestion } from './model';

/** Lets long identifiers like `a.b(c(d))` wrap after . ( , ; : and before camelCase humps instead of running off the card. */
const breakable = (x: string) => x.split(/(?<=[.(,;:\]\[{}<>=+\-/_])|(?<=[a-z])(?=[A-Z])/).flatMap((part, i) => (i ? [<wbr key={i} />, part] : [part]));

/** **bold** and `code` inside a line, optionally with search matches marked. */
export function Inline({ text, terms }: { text: string; terms?: string[] }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  const t = (x: string) => (terms?.length ? <Highlighted text={x} terms={terms} /> : x);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
          <b key={i}>{t(p.slice(2, -2))}</b>
        ) : p.startsWith('`') && p.endsWith('`') && p.length > 2 ? (
          <code key={i} className="dk-ic">
            {terms?.length ? t(p.slice(1, -1)) : breakable(p.slice(1, -1))}
          </code>
        ) : (
          <Fragment key={i}>{t(p)}</Fragment>
        ),
      )}
    </>
  );
}

/** A question's text: prose lines, and code between ``` lines shown as a block. */
export function QText({ text, terms, small, as: Tag = 'h2' }: { text: string; terms?: string[]; small?: boolean; as?: 'h2' | 'h3' | 'div' }) {
  const blocks: Array<{ code: boolean; lines: string[] }> = [];
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line.trim())) {
      fence = !fence;
      blocks.push({ code: fence, lines: [] });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && last.code === fence) last.lines.push(line);
    else blocks.push({ code: fence, lines: [line] });
  }
  const parts = blocks.filter((b) => b.lines.length);
  const hasCode = parts.some((b) => b.code);
  const Outer = hasCode ? 'div' : Tag;
  return (
    <Outer className={cn('dk-qtext', small && 'is-sm', hasCode && 'has-code')} {...(hasCode ? { role: 'heading', 'aria-level': Tag === 'h3' ? 3 : 2 } : {})}>
      {parts.map((b, i) =>
        b.code ? (
          <pre key={i} className="dk-codeblock">
            <code>{terms?.length ? <Highlighted text={b.lines.join('\n')} terms={terms} /> : b.lines.join('\n')}</code>
          </pre>
        ) : (
          <span key={i} className="dk-qline">
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l} terms={terms} />
              </Fragment>
            ))}
          </span>
        ),
      )}
    </Outer>
  );
}

/** A tip's text: paragraphs split by a blank line, "- " lines as a list, **bold**, pipe tables. */
export function TipBody({ body }: { body: string }) {
  return <Prose text={body} />;
}

export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlight(text, terms).map((p, i) => (p.hit ? <mark key={i}>{p.t}</mark> : <Fragment key={i}>{p.t}</Fragment>))}
    </>
  );
}

/** Note, other exam's answer, other ways of asking, the original question: label + text. */
export function extraNotes(q: DeckQuestion, QI: Map<string, DeckQuestion>): Array<[string, ReactNode]> {
  const out: Array<[string, ReactNode]> = [];
  if (q.explain) out.push(['Giải thích', <TipInlineLines key="e" text={q.explain} />]);
  if (q.note) out.push(['Ghi chú', <TipInlineLines key="n" text={q.note} />]);
  if (q.alt)
    out.push([
      'Đề khác',
      <>
        Có đề dùng đáp án: <b>{q.alt}</b>
      </>,
    ]);
  for (const [i, a] of (q.asked ?? []).entries())
    out.push([
      'Hỏi cách khác',
      <Fragment key={i}>
        {a.q} <b>{a.a}</b>
      </Fragment>,
    ]);
  if (q.parent && QI.get(q.parent)) out.push(['Câu gốc', <>Kiểu hỏi khác của câu {q.parent}: {QI.get(q.parent)!.text}</>]);
  return out;
}

function TipInlineLines({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <Inline text={l} />
        </Fragment>
      ))}
    </>
  );
}

export function Notes({ q, compact }: { q: DeckQuestion; compact?: boolean }) {
  const { m } = useDeckCtx();
  const notes = extraNotes(q, m.QI);
  if (!notes.length) return null;
  return (
    <div className={cn('dk-notes', compact && 'is-compact')}>
      {notes.map(([k, v], i) => (
        <p key={i}>
          <span>{k}</span>
          <span>{v}</span>
        </p>
      ))}
    </div>
  );
}

/** The answer warning (always), the memory tips and the look-alike questions (if turned on). */
export function StudyAids({ q, sim = true }: { q: DeckQuestion; sim?: boolean }) {
  const { m, settings } = useDeckCtx();
  // A PE frame usually already holds the tip's template: show it once.
  const tips = settings.tips ? q.tips.map((n) => m.tips.get(n)).filter((t) => t && !tipCoveredBy(t.body, q.frame)) : [];
  const similar = sim && settings.sim ? q.similar.map((id) => m.QI.get(id)).filter((x): x is StudyQuestion => Boolean(x)) : [];
  if (!q.warning && !tips.length && !similar.length) return null;
  return (
    <div className="dk-aids">
      {q.warning && (
        <div className="dk-tip is-warn">
          <div className="dk-tip-h">
            <TriangleAlert className="ic ic-sm" />
            Lưu ý về đáp án câu này
          </div>
          <TipBody body={q.warning} />
        </div>
      )}
      {tips.map((t) => (
        <div key={t!.n} className="dk-tip">
          <div className="dk-tip-h">
            <Lightbulb className="ic ic-sm" />
            Mẹo nhớ: {t!.title}
          </div>
          <TipBody body={t!.body} />
        </div>
      ))}
      {similar.length > 0 && (
        <div className="dk-sim">
          <div className="dk-tip-h">
            <Copy className="ic ic-sm" />
            Câu dễ nhầm
          </div>
          {similar.map((r) => (
            <div key={r.id} className="dk-sim-row">
              <span className="dk-sim-n">Câu {r.id}</span>
              <span>
                <Inline text={r.text.replace(/```\w*\n?/g, '')} />
              </span>
              <span className="dk-sim-a">
                {r.written ? <em>Câu tự luận · xem lời giải ở câu {r.id}</em> : <Inline text={r.answers.map((k) => r.options[k]).join('; ')} />}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function hasAids(q: DeckQuestion, settings: { tips: boolean; sim: boolean }, tips?: Map<number, { body: string }>) {
  const ownTips = q.tips.filter((n) => !tips || !tipCoveredBy(tips.get(n)?.body ?? '', q.frame));
  return Boolean(q.warning || (settings.tips && ownTips.length) || (settings.sim && q.similar.length));
}

const normLine = (s: string) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Whether a question's frame already contains most of a tip (the frame was built from that tip). */
export function tipCoveredBy(tip: string, frame?: string | null) {
  if (!frame) return false;
  const F = normLine(frame);
  const lines = tip.split('\n').map(normLine).filter((l) => l.length > 3);
  if (!lines.length) return false;
  return lines.filter((l) => F.includes(l)).length / lines.length >= 0.5;
}

const SCOPES: Array<[Scope, string, keyof ReturnType<typeof countsOf>]> = [
  ['all', 'Tất cả', 'all'],
  ['new', 'Chưa làm', 'nw'],
  ['bad', 'Cần ôn', 'bad'],
  ['mk', 'Đánh dấu', 'mk'],
];

/** How often a question has been asked and in which terms, from the tags in front of its text. */
export function SeenTags({ q }: { q: StudyQuestion }) {
  if (!q.freq) return null;
  return (
    <>
      <span className={cn('dk-tag dk-freq', q.freq >= 3 && 'is-hot')} title={`Đã ra đề ${q.freq} lần`}>
        <Flame className="ic ic-sm" />
        Ra {q.freq} lần
      </span>
      {q.seen.map((t) => (
        <span key={t.label} className="dk-tag dk-term" title={`Kỳ ${t.term}${t.block ? `, block ${t.block} tuần` : ''}${t.retake ? ', thi lại' : ''}`}>
          {t.label}
        </span>
      ))}
    </>
  );
}

type FilterValue = { ch: number; scope: Scope; slice: Slice; order: Order };

/** Chapter, which questions, which exam terms and how often, question order and answer order — shared by practice and cards. */
export function FilterBar({
  ch,
  scope,
  slice = NO_SLICE,
  order,
  onChange,
}: {
  ch: number;
  scope: Scope;
  slice?: Slice;
  order: Order;
  onChange: (next: FilterValue) => void;
}) {
  const { m, state, settings, setSetting } = useDeckCtx();
  const k = countsOf(m, state, settings.srs, ch);
  const set = (patch: Partial<FilterValue>) => onChange({ ch, scope, slice, order, ...patch });
  const inChapter = m.Q.filter((q) => !ch || q.chapter === ch);
  const newestRank = m.terms[0]?.rank;
  return (
    <div className="dk-filters-wrap">
      <div className="dk-filters">
        {m.chapters.length > 0 && (
          <label className="dk-select">
            <span className="sr-only">Chương</span>
            <select className="select" value={ch} onChange={(e) => set({ ch: Number(e.target.value) })}>
              <option value={0}>Tất cả chương</option>
              {m.chapters.map((c) => (
                <option key={c.n} value={c.n}>
                  {chapterTitle(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="seg dk-seg" role="group" aria-label="Phạm vi câu hỏi">
          {SCOPES.map(([v, l, key]) => (
            <button key={v} type="button" aria-pressed={scope === v} onClick={() => set({ scope: v })}>
              {l}
              <span className="dk-n">{fmtInt(k[key])}</span>
            </button>
          ))}
        </div>
        <button type="button" className={cn('dk-toggle', order === 'rand' && 'is-on')} aria-pressed={order === 'rand'} onClick={() => set({ order: order === 'rand' ? 'seq' : 'rand' })}>
          <Shuffle className="ic ic-sm" />
          Xáo câu
        </button>
        <button type="button" className={cn('dk-toggle', settings.shuf && 'is-on')} aria-pressed={settings.shuf} onClick={() => setSetting('shuf', !settings.shuf)}>
          <ArrowDownUp className="ic ic-sm" />
          Xáo đáp án
        </button>
      </div>
      {m.terms.length > 0 && (
        <div className="dk-filters dk-filters-terms" role="group" aria-label="Lọc theo kỳ thi và tần suất">
          <label className="dk-select">
            <span className="sr-only">Kỳ thi</span>
            <select className="select" value={termFilterKey(slice.term)} onChange={(e) => set({ slice: { ...slice, term: parseTermFilter(e.target.value) } })}>
              <option value="">Mọi kỳ thi</option>
              {m.terms.map((t) => (
                <option key={`only:${t.code}`} value={`only:${t.code}`}>
                  Chỉ {t.code} ({fmtInt(inChapter.filter((q) => matchesTermFilter(q.seen, { mode: 'only', code: t.code })).length)} câu)
                </option>
              ))}
              {m.terms
                .filter((t) => t.rank !== newestRank)
                .map((t) => (
                  <option key={`from:${t.code}`} value={`from:${t.code}`}>
                    Từ {t.code} trở đi ({fmtInt(inChapter.filter((q) => matchesTermFilter(q.seen, { mode: 'from', code: t.code })).length)} câu)
                  </option>
                ))}
            </select>
          </label>
          {m.maxFreq > 1 && (
            <label className="dk-select">
              <span className="sr-only">Tần suất xuất hiện</span>
              <select className="select" value={slice.min} onChange={(e) => set({ slice: { ...slice, min: Number(e.target.value) } })}>
                <option value={0}>Mọi tần suất</option>
                {Array.from({ length: m.maxFreq - 1 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    Ra từ {n} lần trở lên ({fmtInt(inChapter.filter((q) => q.freq >= n).length)} câu)
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className={cn('dk-toggle', order === 'freq' && 'is-on')} aria-pressed={order === 'freq'} onClick={() => set({ order: order === 'freq' ? 'seq' : 'freq' })}>
            <Flame className="ic ic-sm" />
            Hay ra trước
          </button>
          {sliceActive(slice) && (
            <button type="button" className="dk-toggle" onClick={() => set({ slice: NO_SLICE })}>
              Bỏ lọc kỳ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function StudyEmpty({ scope, onAll, custom }: { scope: Scope; onAll: () => void; custom?: boolean }) {
  const { settings } = useDeckCtx();
  const msg: Record<Scope, [string, string]> = {
    new: ['Bạn đã làm hết câu ở mục này', 'Chọn Cần ôn để luyện lại câu sai, hoặc Tất cả để làm lại từ đầu.'],
    bad: settings.srs
      ? ['Hôm nay không còn câu nào cần ôn', 'Câu sai, câu đoán và câu tới hạn ôn sẽ xuất hiện ở đây. Quay lại vào ngày mai nhé.']
      : ['Không còn câu nào cần ôn', 'Câu bạn trả lời sai sẽ xuất hiện ở đây để luyện lại.'],
    mk: ['Chưa có câu đánh dấu', 'Bấm ngôi sao trên câu hỏi để lưu lại những câu khó.'],
    all: ['Không có câu hỏi', 'Thử chọn chương khác.'],
  };
  const [title, text] = custom ? ['Không có câu nào', 'Danh sách này đang trống.'] : msg[scope];
  return (
    <div className="dk-empty">
      <h3>{title}</h3>
      <p>{text}</p>
      <button type="button" className="btn btn-primary" onClick={onAll}>
        Xem tất cả câu
      </button>
    </div>
  );
}

/** A ring that fills to `value` percent. */
export function Ring({ value, tone = 'violet', size = 200, children }: { value: number; tone?: 'violet' | 'good' | 'low'; size?: number; children?: ReactNode }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('dk-ring', `is-${tone}`)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" aria-hidden>
        <circle className="dk-ring-track" cx="60" cy="60" r="52" />
        <circle className={cn('dk-ring-fill', v < 0.5 && 'is-zero')} cx="60" cy="60" r="52" pathLength={100} style={{ ['--v' as string]: v }} />
      </svg>
      <div className="dk-ring-in">{children}</div>
    </div>
  );
}

export function Banner({ label, onExit, exitLabel }: { label: string; onExit: () => void; exitLabel: string }) {
  return (
    <div className="dk-banner">
      <span>{label}</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onExit}>
        {exitLabel}
      </button>
    </div>
  );
}

export function SelectChevron() {
  return <ChevronDown className="ic ic-xs" aria-hidden />;
}

/** Bursts of colour for a strong exam result; skipped when motion is reduced. */
export function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'dk-confetti';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const cols = ['#2448D8', '#5B88F6', '#E7A033', '#17865B', '#CF3A31'];
  const P = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 180,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 13,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 4,
    c: cols[Math.floor(Math.random() * cols.length)],
  }));
  const t0 = performance.now();
  const step = (now: number) => {
    const el = now - t0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of P) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - el / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (el < 2600) requestAnimationFrame(step);
    else cv.remove();
  };
  requestAnimationFrame(step);
}

/** "Gợi ý" before answering: closed until asked for. */
export function HintToggle({ hint }: { hint?: string }) {
  const [open, setOpen] = useState(false);
  if (!hint) return null;
  return open ? (
    <div className="dk-hintbox">
      <div className="dk-tip-h">
        <Lightbulb className="ic ic-sm" />
        Gợi ý
      </div>
      <p>
        <Inline text={hint} />
      </p>
    </div>
  ) : (
    <button
      type="button"
      className="btn btn-ghost btn-sm dk-hint-btn"
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
    >
      <Lightbulb className="ic ic-sm" />
      Gợi ý
    </button>
  );
}

/** The library's big search box: typing examples until you click in it. */
export { BigSearch } from '@/components/ui/BigSearch';

/* ─────────────────────────────── PE ─────────────────────────────── */

/** Statement or model answer: ``` code blocks kept exactly, the rest as paragraphs and "- " lists. */
export function RichBody({ text, className }: { text: string; className?: string }) {
  const blocks: Array<{ code: boolean; lang: string; lines: string[] }> = [];
  let fence = false;
  for (const line of text.split('\n')) {
    const f = /^\s*```\s*([\w#+.-]*)/.exec(line);
    if (f) {
      fence = !fence;
      blocks.push({ code: fence, lang: fence ? f[1] : '', lines: [] });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && last.code === fence) last.lines.push(line);
    else blocks.push({ code: fence, lang: '', lines: [line] });
  }
  return (
    <div className={cn('dk-rich', className)}>
      {blocks
        .filter((b) => b.lines.some((l) => l.trim()) || b.code)
        .map((b, i) =>
          b.code ? (
            <pre key={i} className="dk-codeblock" data-lang={b.lang || undefined}>
              <code>{b.lines.join('\n')}</code>
            </pre>
          ) : (
            <Prose key={i} text={b.lines.join('\n').trim()} />
          ),
        )}
    </div>
  );
}

/** Paragraphs, with runs of "- " or "1. " lines inside them shown as lists, and pipe tables. */
export function Prose({ text }: { text: string }) {
  const out: ReactNode[] = [];
  text.split(/\n{2,}/).forEach((para, i) => {
    const rows = para.split('\n');
    if (rows.length >= 2 && rows.every((r) => r.trim().startsWith('|'))) {
      const cells = rows
        .filter((r) => !/^\s*\|?\s*:?-{3,}/.test(r))
        .map((r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
      const [head, ...body] = cells;
      out.push(
        <div key={i} className="dk-table-wrap">
          <table className="dk-table">
            <thead>
              <tr>{head!.map((c, k) => <th key={k}><Inline text={c.replace(/^\*\*(.*)\*\*$/, '$1')} /></th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, j) => (
                <tr key={j}>{r.map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      return;
    }
    let run: { kind: 'ul' | 'ol' | 'p'; lines: string[] } | null = null;
    const runs: Array<{ kind: 'ul' | 'ol' | 'p'; lines: string[] }> = [];
    for (const l of para.split('\n')) {
      const kind = /^\s*[-•*]\s+/.test(l) ? 'ul' : /^\s*\d+[.)]\s+/.test(l) ? 'ol' : 'p';
      if (!run || run.kind !== kind) runs.push((run = { kind, lines: [] }));
      run.lines.push(kind === 'ul' ? l.replace(/^\s*[-•*]\s+/, '') : kind === 'ol' ? l.replace(/^\s*\d+[.)]\s+/, '') : l);
    }
    runs.forEach((r, j) => {
      const key = `${i}-${j}`;
      if (r.kind === 'p')
        out.push(
          <p key={key}>
            {r.lines.map((l, k) => (
              <Fragment key={k}>
                {k > 0 && <br />}
                <Inline text={l} />
              </Fragment>
            ))}
          </p>,
        );
      else {
        const L = r.kind;
        out.push(
          <L key={key}>
            {r.lines.map((l, k) => (
              <li key={k}>
                <Inline text={l} />
              </li>
            ))}
          </L>,
        );
      }
    });
  });
  return <div className="dk-tipbody dk-prose">{out}</div>;
}

/** Whether each paper is folded, kept while moving between its questions. */
const folded = new Map<number, boolean>();

/**
 * The PE paper a question is about, above the question: the full statement,
 * its exam terms, and every question asked about it so the learner can move
 * between them or practise the whole paper.
 */
export function PaperCard({
  q,
  onGo,
  onPracticeAll,
  lang,
}: {
  q: StudyQuestion;
  onGo?: (id: string) => void;
  onPracticeAll?: (ids: string[], label: string) => void;
  /** Given in the PE view: show the English and Vietnamese halves side by side. */
  lang?: Lang;
}) {
  const { m, state, settings } = useDeckCtx();
  const paper = q.paper != null ? m.papers.get(q.paper) : undefined;
  const [closed, setClosed] = useState(() => (paper ? (folded.get(paper.n) ?? false) : false));
  const [full, setFull] = useState(false);
  if (!paper) return null;
  const ids = m.paperQuestions.get(paper.n) ?? [];
  const { status } = makeStatus(state, settings.srs);
  const toggle = () => {
    folded.set(paper.n, !closed);
    setClosed(!closed);
  };
  const bi = lang ? splitLang(paper.body) : null;
  const shown = bi ? (lang === 'en' ? bi.en : lang === 'vi' ? bi.vi : bi.en.length > bi.vi.length ? bi.en : bi.vi) : paper.body;
  const long = shown.length > (bi && lang === 'both' ? 1400 : 900) || shown.split('\n').length > 24;
  return (
    <section className={cn('dk-paper', closed && 'is-closed')} aria-label={`Đề ${paper.n}`}>
      <header className="dk-paper-head">
        <span className="dk-paper-ic">
          <FileCode2 className="ic ic-sm" />
        </span>
        <div className="dk-paper-title">
          <small>Đề {paper.n} · {ids.length} câu</small>
          <b>{paper.title}</b>
        </div>
        <div className="dk-paper-tags">
          {paper.seen.map((t) => (
            <span key={t.code} className="dk-tag dk-term">{t.label}</span>
          ))}
        </div>
        <button type="button" className="icon-btn" onClick={toggle} aria-expanded={!closed} aria-label={closed ? 'Mở đề' : 'Thu gọn đề'} data-tip={closed ? 'Mở đề' : 'Thu gọn đề'}>
          {closed ? <ChevronDown className="ic ic-sm" /> : <ChevronUp className="ic ic-sm" />}
        </button>
      </header>
      {!closed && (
        <>
          <div className={cn('dk-paper-body', long && !full && 'is-clipped', bi && 'is-pe')}>
            {bi ? (
              <>
                {bi.head && <RichBody text={bi.head} className="pe-head" />}
                <Bilingual parts={bi} lang={lang!} />
              </>
            ) : (
              <RichBody text={paper.body} />
            )}
          </div>
          {long && (
            <button type="button" className="btn btn-ghost btn-sm dk-paper-more" onClick={() => setFull((f) => !f)}>
              {full ? <Minimize2 className="ic ic-xs" /> : <Maximize2 className="ic ic-xs" />}
              {full ? 'Thu ngắn đề' : 'Xem toàn bộ đề'}
            </button>
          )}
        </>
      )}
      {ids.length > 1 && (
        <footer className="dk-paper-qs">
          <span>Câu trong đề</span>
          <div>
            {ids.map((id) => {
              const st = status(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={cn('dk-paper-q', id === q.id && 'is-cur', st !== 'new' && `is-${st}`)}
                  aria-current={id === q.id ? 'true' : undefined}
                  disabled={!onGo || id === q.id}
                  onClick={() => onGo?.(id)}
                >
                  {m.QI.get(id)?.written ? <BookOpenCheck className="ic ic-xs" /> : <ListChecks className="ic ic-xs" />}
                  {id}
                </button>
              );
            })}
          </div>
          {onPracticeAll && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPracticeAll(ids, `Đang luyện Đề ${paper.n}: ${paper.title}`)}>
              Luyện cả đề
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

/** The model answer of a written question. */
export function Solution({ q, title = 'Lời giải mẫu' }: { q: StudyQuestion; title?: string }) {
  if (!q.solution) return null;
  return (
    <div className="dk-solution">
      <div className="dk-tip-h">
        <BookOpenCheck className="ic ic-sm" />
        {title}
      </div>
      <RichBody text={q.solution} />
    </div>
  );
}

/** How to set out a written answer, without the answer. */
export function Frame({ q, title = 'Khung làm bài' }: { q: StudyQuestion; title?: string }) {
  if (!q.frame) return null;
  return (
    <div className="dk-frame">
      <div className="dk-tip-h">
        <LayoutTemplate className="ic ic-sm" />
        {title}
      </div>
      <RichBody text={q.frame} />
    </div>
  );
}

/** A question's text: written (PE) ones may hold lists and tables. */
export function QuestionText({ q, terms, small }: { q: StudyQuestion; terms?: string[]; small?: boolean }) {
  if (q.written && !terms?.length) return <RichBody text={q.text} className={cn('dk-qrich', small && 'is-sm')} />;
  return <QText text={q.text} terms={terms} small={small} as={small ? 'h3' : 'h2'} />;
}

/** Tags at the top of a question: chapter (or PE), paper, written. */
export function KindTags({ q }: { q: StudyQuestion }) {
  const { m } = useDeckCtx();
  const ch = m.chapterTag(q.chapter);
  return (
    <>
      {ch && <span className={cn('dk-tag', ch === 'PE' && 'is-pe')}>{ch}</span>}
      {q.paper != null && <span className="dk-tag is-paper">Đề {q.paper}</span>}
      {q.written && <span className="dk-tag is-written">Tự luận</span>}
    </>
  );
}
