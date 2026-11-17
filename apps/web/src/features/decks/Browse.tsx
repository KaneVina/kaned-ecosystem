import { useEffect, useMemo, useState } from 'react';
import { CircleCheckBig, Eye, EyeOff, Lightbulb, Search, Star } from 'lucide-react';
import { foldVi } from '@kaned/shared';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { useDeckCtx, type BrowseState } from './context';
import { countsOf, LET, makeStatus, qLabel } from './model';
import { BigSearch, Inline, Notes, QText, StudyAids, hasAids } from './parts';

export function Browse() {
  const { m, state, settings, browse: B, setBrowse, startPractice, go, progress } = useDeckCtx();
  const [text, setText] = useState(B.q);
  const [shown, setShown] = useState<Set<string>>(new Set());
  useEffect(() => {
    const t = window.setTimeout(() => setBrowse((b) => (b.q === text ? b : { ...b, q: text, limit: 40 })), 160);
    return () => window.clearTimeout(t);
  }, [text, setBrowse]);

  const { status, marked } = makeStatus(state);
  // Examples from this deck: chapter names, words in `code`, a question number.
  const hints = useMemo(() => {
    const out: string[] = [];
    for (const c of m.chapters.slice(0, 3)) out.push(`“${c.name.split(/\s+/).slice(0, 4).join(' ').toLowerCase()}”`);
    if (out.length < 3) {
      const seen = new Map<string, number>();
      for (const q of m.Q) for (const x of `${q.text} ${q.options.join(' ')}`.matchAll(/`([A-Za-z][\w.]{2,24})`/g)) seen.set(x[1], (seen.get(x[1]) ?? 0) + 1);
      for (const [w] of [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3 - out.length)) out.push(`“${w}”`);
    }
    if (m.Q.length > 12) out.push(`“${m.Q[11].id}” để mở câu ${m.Q[11].id}`);
    return out;
  }, [m]);
  const terms = useMemo(() => foldVi(B.q.trim()).split(/\s+/).filter(Boolean), [B.q]);
  const list = useMemo(() => {
    const nd = foldVi(B.q.trim());
    return m.Q.filter((q, i) => {
      if (B.ch && q.chapter !== B.ch) return false;
      const s = status(q.id);
      if (B.scope === 'ok' && s !== 'ok') return false;
      if (B.scope === 'bad' && s !== 'bad') return false;
      if (B.scope === 'new' && s !== 'new') return false;
      if (B.scope === 'mk' && !marked(q.id)) return false;
      if (B.scope === 'multi' && q.answers.length < 2) return false;
      return terms.every((t) => m.search[i].includes(t)) || (/^\d+(\.\d+)?$/.test(nd) && q.id === nd);
    });
    // status/marked come from state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, state, B.q, B.ch, B.scope, terms]);

  const k = countsOf(m, state, B.ch);
  const multiN = m.Q.filter((q) => (!B.ch || q.chapter === B.ch) && q.answers.length > 1).length;
  const set = (patch: Partial<BrowseState>) => setBrowse((b) => ({ ...b, ...patch, limit: 40 }));
  const scopes: Array<[BrowseState['scope'], string, number]> = [
    ['all', 'Tất cả', k.all],
    ['new', 'Chưa làm', k.nw],
    ['ok', 'Đã thuộc', k.ok],
    ['bad', 'Cần ôn', k.bad],
    ['mk', 'Đánh dấu', k.mk],
    ...(multiN ? [['multi', 'Nhiều đáp án', multiN] as [BrowseState['scope'], string, number]] : []),
  ];

  return (
    <div className="dk-browse">
      <BigSearch id="dk-bq" value={text} onChange={setText} label="Tìm câu hỏi" placeholder="Tìm theo từ khoá, có dấu hay không dấu đều được, hoặc gõ số câu" hints={hints} />
      <div className="dk-filters">
        {m.chapters.length > 0 && (
          <select className="select" value={B.ch} onChange={(e) => set({ ch: Number(e.target.value) })} aria-label="Chương">
            <option value={0}>Tất cả chương</option>
            {m.chapters.map((c) => (
              <option key={c.n} value={c.n}>
                {c.n ? `Chương ${c.n}: ${c.name}` : c.name}
              </option>
            ))}
          </select>
        )}
        <div className="seg dk-seg" role="group" aria-label="Lọc theo trạng thái">
          {scopes.map(([v, l, n]) => (
            <button key={v} type="button" aria-pressed={B.scope === v} onClick={() => set({ scope: v })}>
              {l}
              <span className="dk-n">{fmtInt(n)}</span>
            </button>
          ))}
        </div>
        <button type="button" className={cn('dk-toggle', B.hide && 'is-on')} aria-pressed={B.hide} onClick={() => (setBrowse((b) => ({ ...b, hide: !b.hide })), setShown(new Set()))}>
          {B.hide ? <EyeOff className="ic ic-sm" /> : <Eye className="ic ic-sm" />}
          Che đáp án
        </button>
      </div>
      <div className="dk-count">
        <span>
          {fmtInt(list.length)} câu{B.q.trim() ? ` khớp với “${B.q.trim()}”` : ''}
        </span>
        {list.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              startPractice({ custom: { ids: list.map((q) => q.id), label: `Đang luyện ${list.length} câu từ kết quả tra cứu` } });
              go('practice');
            }}
          >
            <CircleCheckBig className="ic ic-sm" />
            Luyện các câu này
          </button>
        )}
      </div>

      <div className="dk-qlist">
        {list.slice(0, B.limit).map((q) => {
          const s = status(q.id);
          const hidden = B.hide && !shown.has(q.id);
          const isMarked = marked(q.id);
          return (
            <article key={q.id} className={cn('dk-qitem', hidden && 'is-hidden')}>
              <div className="dk-qhead">
                <span className="dk-qnum">{qLabel(q)}</span>
                {q.chapter > 0 && <span className="dk-tag">Chương {q.chapter}</span>}
                {q.parent && <span className="dk-tag is-var">Kiểu hỏi khác</span>}
                {q.answers.length > 1 && <span className="dk-tag is-multi">{q.answers.length} đáp án</span>}
                {s !== 'new' && (
                  <span className="dk-tag">
                    <i className={cn('dk-dot', s === 'ok' ? 'is-ok' : 'is-bad')} />
                    {s === 'ok' ? 'Đã thuộc' : 'Cần ôn'}
                  </span>
                )}
                <span className="spacer" />
                <button type="button" className={cn('icon-btn dk-star', isMarked && 'is-on')} aria-pressed={isMarked} aria-label="Đánh dấu" onClick={() => progress.toggleMark(q.id)}>
                  <Star className="ic ic-sm" />
                </button>
              </div>
              <QText text={q.text} terms={terms} small as="h3" />
              <ul className="dk-fopts">
                {q.options.map((o, j) => (
                  <li key={j} className={!hidden && q.answers.includes(j) ? 'is-right' : ''}>
                    <b>{LET[j]}</b>
                    <span>
                      <Inline text={o} terms={terms} />
                    </span>
                  </li>
                ))}
              </ul>
              {hidden ? (
                <button type="button" className="btn btn-secondary btn-sm dk-reveal" onClick={() => setShown((x) => new Set(x).add(q.id))}>
                  <Eye className="ic ic-sm" />
                  Hiện đáp án
                </button>
              ) : (
                <>
                  <Notes q={q} compact />
                  {hasAids(q, settings) && (
                    <details className="dk-tipd">
                      <summary>
                        <Lightbulb className="ic ic-xs" />
                        Mẹo nhớ{settings.sim && q.similar.length ? ' và câu dễ nhầm' : ''}
                        {q.warning ? ' · có lưu ý đáp án' : ''}
                      </summary>
                      <StudyAids q={q} />
                    </details>
                  )}
                </>
              )}
            </article>
          );
        })}
        {!list.length && (
          <div className="dk-empty">
            <h3>Không tìm thấy câu nào</h3>
            <p>Thử từ khoá ngắn hơn, hoặc bỏ bớt bộ lọc chương và trạng thái.</p>
          </div>
        )}
      </div>
      {list.length > B.limit && (
        <div className="dk-more">
          <button type="button" className="btn btn-secondary" onClick={() => setBrowse((b) => ({ ...b, limit: b.limit + 60 }))}>
            Xem thêm {fmtInt(Math.min(60, list.length - B.limit))} câu
          </button>
        </div>
      )}
    </div>
  );
}
