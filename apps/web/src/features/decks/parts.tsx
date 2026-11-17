import { Fragment, type ReactNode } from 'react';
import { ArrowDownUp, ChevronDown, Copy, Lightbulb, Shuffle, TriangleAlert } from 'lucide-react';
import type { DeckQuestion } from '@kaned/shared';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import { countsOf, highlight, type Scope } from './model';

/** **bold** inside a line. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

/** A tip's text: paragraphs split by a blank line, "- " lines as a list, **bold**. */
export function TipBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/);
  return (
    <div className="dk-tipbody">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.replace(/^\s*[-•]\s+/, '')} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
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
  const tips = settings.tips ? q.tips.map((n) => m.tips.get(n)).filter(Boolean) : [];
  const similar = sim && settings.sim ? q.similar.map((id) => m.QI.get(id)).filter((x): x is DeckQuestion => Boolean(x)) : [];
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
              <span>{r.text}</span>
              <span className="dk-sim-a">{r.answers.map((k) => r.options[k]).join('; ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function hasAids(q: DeckQuestion, settings: { tips: boolean; sim: boolean }) {
  return Boolean(q.warning || (settings.tips && q.tips.length) || (settings.sim && q.similar.length));
}

const SCOPES: Array<[Scope, string, keyof ReturnType<typeof countsOf>]> = [
  ['all', 'Tất cả', 'all'],
  ['new', 'Chưa làm', 'nw'],
  ['bad', 'Cần ôn', 'bad'],
  ['mk', 'Đánh dấu', 'mk'],
];

/** Chapter, which questions, question order and answer order — shared by practice and cards. */
export function FilterBar({
  ch,
  scope,
  order,
  onChange,
}: {
  ch: number;
  scope: Scope;
  order: 'seq' | 'rand';
  onChange: (next: { ch: number; scope: Scope; order: 'seq' | 'rand' }) => void;
}) {
  const { m, state, settings, setSetting } = useDeckCtx();
  const k = countsOf(m, state, ch);
  return (
    <div className="dk-filters">
      {m.chapters.length > 0 && (
        <label className="dk-select">
          <span className="sr-only">Chương</span>
          <select className="select" value={ch} onChange={(e) => onChange({ ch: Number(e.target.value), scope, order })}>
            <option value={0}>Tất cả chương</option>
            {m.chapters.map((c) => (
              <option key={c.n} value={c.n}>
                {c.n ? `Chương ${c.n}: ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="seg dk-seg" role="group" aria-label="Phạm vi câu hỏi">
        {SCOPES.map(([v, l, key]) => (
          <button key={v} type="button" aria-pressed={scope === v} onClick={() => onChange({ ch, scope: v, order })}>
            {l}
            <span className="dk-n">{fmtInt(k[key])}</span>
          </button>
        ))}
      </div>
      <button type="button" className={cn('dk-toggle', order === 'rand' && 'is-on')} aria-pressed={order === 'rand'} onClick={() => onChange({ ch, scope, order: order === 'rand' ? 'seq' : 'rand' })}>
        <Shuffle className="ic ic-sm" />
        Xáo câu
      </button>
      <button type="button" className={cn('dk-toggle', settings.shuf && 'is-on')} aria-pressed={settings.shuf} onClick={() => setSetting('shuf', !settings.shuf)}>
        <ArrowDownUp className="ic ic-sm" />
        Xáo đáp án
      </button>
    </div>
  );
}

export function StudyEmpty({ scope, onAll, custom }: { scope: Scope; onAll: () => void; custom?: boolean }) {
  const msg: Record<Scope, [string, string]> = {
    new: ['Bạn đã làm hết câu ở mục này', 'Chọn Cần ôn để luyện lại câu sai, hoặc Tất cả để làm lại từ đầu.'],
    bad: ['Không còn câu nào cần ôn', 'Câu bạn trả lời sai sẽ xuất hiện ở đây để luyện lại.'],
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
  const cols = ['#4433B4', '#7B6CE0', '#E7A033', '#17865B', '#CF3A31'];
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
