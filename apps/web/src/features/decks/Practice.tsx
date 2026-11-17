import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Flame, RotateCcw, Star, Timer, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import { beep, LET, makePerm, qLabel, sameSet } from './model';
import { Banner, FilterBar, Notes, StudyAids, StudyEmpty } from './parts';

export function Practice() {
  const { m, state, settings, practice: P, setPractice, startPractice, progress, go, setExam } = useDeckCtx();
  const [sel, setSel] = useState<number[]>([]);
  const [dir, setDir] = useState(0);
  const autoTimer = useRef<number>();
  const id = P.ids[P.idx];
  const q = id ? m.QI.get(id) : undefined;
  const res = id ? P.res[id] : undefined;
  const multi = (q?.answers.length ?? 0) > 1;

  // Answer order: kept per question for the session, reshuffled when the setting changes.
  const perm = useMemo(() => (q ? (P.perm[q.id] ?? makePerm(q, settings.shuf)) : []), [q, P.perm, settings.shuf]);
  useEffect(() => {
    if (q && !P.perm[q.id]) setPractice((s) => ({ ...s, perm: { ...s.perm, [q.id]: perm } }));
  }, [q, P.perm, perm, setPractice]);
  const shufRef = useRef(settings.shuf);
  useEffect(() => {
    if (shufRef.current === settings.shuf) return;
    shufRef.current = settings.shuf;
    setPractice((s) => ({ ...s, perm: Object.fromEntries(Object.entries(s.perm).filter(([k]) => s.res[k])) }));
  }, [settings.shuf, setPractice]);

  // Remember where practice stopped.
  useEffect(() => {
    if (id) progress.setResume({ ch: P.custom ? 0 : P.ch, id });
  }, [id, P.ch, P.custom, progress]);

  useEffect(() => () => window.clearTimeout(autoTimer.current), []);

  const move = useCallback(
    (d: number) => {
      window.clearTimeout(autoTimer.current);
      setSel([]);
      setDir(d);
      setPractice((s) => {
        const n = s.idx + d;
        if (n >= s.ids.length) return { ...s, finished: true };
        if (n < 0) return s;
        return { ...s, idx: n };
      });
    },
    [setPractice],
  );

  const grade = useCallback(
    (chosen: number[]) => {
      if (!q || P.res[q.id]) return;
      const ok = sameSet(chosen, q.answers);
      setPractice((s) => ({ ...s, res: { ...s.res, [q.id]: { sel: chosen, ok } } }));
      progress.record(q.id, ok);
      if (settings.sound) beep(ok);
      if (ok && settings.auto) {
        const at = P.idx;
        autoTimer.current = window.setTimeout(() => {
          setPractice((s) => (s.idx === at ? (s.idx + 1 >= s.ids.length ? { ...s, finished: true } : { ...s, idx: s.idx + 1 }) : s));
          setSel([]);
          setDir(1);
        }, 1100);
      }
    },
    [q, P.res, P.idx, setPractice, progress, settings.sound, settings.auto],
  );

  const choose = useCallback(
    (k: number) => {
      if (!q || res) return;
      if (multi) setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
      else grade([k]);
    },
    [q, res, multi, grade],
  );

  const toggleMark = () => q && progress.toggleMark(q.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || P.finished) return;
      const t = e.target as HTMLElement;
      if (t.closest('input,select,textarea,[role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      let p = LET.indexOf(key);
      if (p < 0) p = '12345678'.indexOf(key);
      if (p >= 0 && p < perm.length) {
        e.preventDefault();
        choose(perm[p]);
      } else if (key === 'Enter') {
        e.preventDefault();
        if (res) move(1);
        else if (multi && sel.length) grade(sel);
      } else if (key === 'ArrowRight') {
        e.preventDefault();
        move(1);
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        move(-1);
      } else if (key === 'M') toggleMark();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const done = Object.keys(P.res).length;
  const okN = Object.values(P.res).filter((r) => r.ok).length;
  const header = P.custom ? (
    <Banner label={P.custom.label} exitLabel="Về toàn bộ câu hỏi" onExit={() => startPractice()} />
  ) : (
    <FilterBar ch={P.ch} scope={P.scope} order={P.order} onChange={(o) => startPractice(o)} />
  );

  if (!P.ids.length) {
    return (
      <>
        {header}
        <StudyEmpty scope={P.scope} custom={Boolean(P.custom)} onAll={() => startPractice()} />
      </>
    );
  }

  if (P.finished || !q) {
    const wrong = Object.entries(P.res)
      .filter(([, r]) => !r.ok)
      .map(([k]) => k);
    return (
      <>
        {header}
        <div className="dk-empty dk-finish">
          <h3>
            Xong {fmtInt(done)} / {fmtInt(P.ids.length)} câu
          </h3>
          <p>
            Bạn trả lời đúng {fmtInt(okN)} câu{wrong.length ? `, sai ${fmtInt(wrong.length)} câu. Luyện lại ngay các câu sai để nhớ lâu hơn.` : '. Làm tốt lắm.'}
          </p>
          <div className="dk-row-center">
            {wrong.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={() => startPractice({ custom: { ids: wrong, label: `Đang luyện lại ${wrong.length} câu sai của lượt trước` } })}>
                <RotateCcw className="ic ic-sm" />
                Luyện lại {fmtInt(wrong.length)} câu sai
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => startPractice({ ch: P.ch, scope: P.scope, order: P.order, custom: P.custom })}>
              Làm lại từ đầu
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setExam((e) => (e.phase === 'run' ? e : { ...e, phase: 'setup' }));
                go('exam');
              }}
            >
              <Timer className="ic ic-sm" />
              Thi thử
            </button>
          </div>
        </div>
      </>
    );
  }

  const correctLetters = q.answers
    .map((k) => LET[perm.indexOf(k)])
    .sort()
    .join(', ');
  const isMarked = Boolean(state.mk[q.id]);

  return (
    <>
      {header}
      <div className="dk-study">
        <div className="dk-study-main">
          <div className="dk-progress">
            <span>
              <b>{P.idx + 1}</b> / {fmtInt(P.ids.length)}
            </span>
            <div className="dk-bar">
              <i className="is-ok" style={{ width: `${((P.idx + 1) / P.ids.length) * 100}%` }} />
            </div>
          </div>

          <article key={q.id} className={cn('dk-card', res && 'is-locked', dir > 0 ? 'enter-r' : dir < 0 ? 'enter-l' : '')}>
            <div className="dk-qhead">
              <span className="dk-qnum">{qLabel(q)}</span>
              {q.chapter > 0 && <span className="dk-tag">Chương {q.chapter}</span>}
              {q.parent && <span className="dk-tag is-var">Kiểu hỏi khác</span>}
              {multi && <span className="dk-tag is-multi">Chọn {q.answers.length} đáp án</span>}
              <span className="spacer" />
              <button type="button" className={cn('icon-btn dk-star', isMarked && 'is-on')} aria-pressed={isMarked} aria-label="Đánh dấu câu này" data-tip="Đánh dấu (M)" onClick={toggleMark}>
                <Star className="ic ic-sm" />
              </button>
            </div>
            <h2 className="dk-qtext">{q.text}</h2>
            <ol className="dk-opts">
              {perm.map((k, pos) => {
                const picked = res ? res.sel.includes(k) : sel.includes(k);
                const right = q.answers.includes(k);
                const cls = res ? (right ? 'is-ok' : picked ? 'is-bad' : 'is-dim') : picked ? 'is-sel' : '';
                return (
                  <li key={k}>
                    <button type="button" className={cn('dk-opt', cls, res && right && !res.sel.includes(k) && 'is-reveal')} onClick={() => choose(k)} disabled={Boolean(res)}>
                      <span className="dk-key">{LET[pos]}</span>
                      <span className="dk-otext">{q.options[k]}</span>
                      <span className="dk-tick">{res && right ? <Check className="ic" /> : res && picked ? <X className="ic" /> : null}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {res && (
              <div className={cn('dk-fb', res.ok ? 'is-ok' : 'is-bad')}>
                <div className="dk-fb-head">
                  {res.ok ? <Check className="ic" /> : <X className="ic" />}
                  {res.ok ? 'Chính xác' : 'Chưa đúng'}
                  {res.ok && state.streak > 1 && (
                    <span className="dk-streak">
                      <Flame className="ic ic-xs" />
                      {fmtInt(state.streak)} câu đúng liên tiếp
                    </span>
                  )}
                </div>
                <p>
                  Đáp án đúng: <b>{correctLetters}</b>
                  {q.answers.length === 1 ? `. ${q.options[q.answers[0]]}` : ''}
                </p>
                <Notes q={q} />
              </div>
            )}
            {res && <StudyAids q={q} />}

            <div className="dk-qfoot">
              <button type="button" className="btn btn-ghost" onClick={() => move(-1)} disabled={P.idx === 0}>
                <ChevronLeft className="ic ic-sm" />
                Câu trước
              </button>
              <span className="spacer" />
              <span className="dk-hint">
                {multi && !res ? (
                  'Chọn đủ đáp án rồi bấm Kiểm tra'
                ) : (
                  <>
                    <kbd>A</kbd>–<kbd>{LET[Math.max(0, perm.length - 1)]}</kbd> chọn, <kbd>Enter</kbd> câu tiếp
                  </>
                )}
              </span>
              {multi && !res ? (
                <button type="button" className="btn btn-primary" disabled={!sel.length} onClick={() => grade(sel)}>
                  <Check className="ic ic-sm" />
                  Kiểm tra
                </button>
              ) : (
                <button type="button" className={cn('btn', res ? 'btn-primary' : 'btn-secondary')} onClick={() => move(1)}>
                  {P.idx >= P.ids.length - 1 ? 'Hoàn thành' : 'Câu tiếp'}
                  <ChevronRight className="ic ic-sm" />
                </button>
              )}
            </div>
          </article>
        </div>

        <aside className="dk-side">
          <div className="panel dk-panel">
            <h3>
              Lượt này{' '}
              <span>
                {fmtInt(done)} / {fmtInt(P.ids.length)} câu
              </span>
            </h3>
            <div className="dk-mini">
              <div>
                <b className="is-ok">{fmtInt(okN)}</b>
                <span>Đúng</span>
              </div>
              <div>
                <b className="is-bad">{fmtInt(done - okN)}</b>
                <span>Sai</span>
              </div>
              <div>
                <b>{fmtInt(state.streak)}</b>
                <span>Chuỗi đúng</span>
              </div>
            </div>
          </div>
          <AnswerSheet
            ids={P.ids}
            current={P.idx}
            cls={(x) => (P.res[x] ? (P.res[x].ok ? 'is-ok' : 'is-bad') : '')}
            flagged={(x) => Boolean(state.mk[x])}
            onGo={(i) => {
              setSel([]);
              setDir(i > P.idx ? 1 : -1);
              setPractice((s) => ({ ...s, idx: i }));
            }}
            legend={[
              ['is-ok', 'Đúng'],
              ['is-bad', 'Sai'],
              ['is-flag', 'Đánh dấu'],
            ]}
            title="Bảng câu hỏi"
          />
          <div className="panel dk-panel dk-keys">
            <h3>Phím tắt</h3>
            <div>
              <span>Chọn đáp án</span>
              <span>
                <kbd>A</kbd>–<kbd>D</kbd> hoặc <kbd>1</kbd>–<kbd>4</kbd>
              </span>
            </div>
            <div>
              <span>Kiểm tra, câu tiếp</span>
              <kbd>Enter</kbd>
            </div>
            <div>
              <span>Chuyển câu</span>
              <span>
                <kbd>←</kbd> <kbd>→</kbd>
              </span>
            </div>
            <div>
              <span>Đánh dấu</span>
              <kbd>M</kbd>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

/** The numbered bubbles: where you are, what is done, what is flagged. */
export function AnswerSheet({
  ids,
  current,
  cls,
  flagged,
  onGo,
  legend,
  title,
  sub,
}: {
  ids: string[];
  current: number;
  cls: (id: string) => string;
  flagged: (id: string) => boolean;
  onGo: (i: number) => void;
  legend: Array<[string, string]>;
  title: string;
  sub?: string;
}) {
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const g = grid.current;
    const cur = g?.querySelector<HTMLElement>('.is-cur');
    if (g && cur) g.scrollTop = cur.offsetTop - g.clientHeight / 2 + cur.offsetHeight / 2;
  }, [current]);
  return (
    <div className="panel dk-panel">
      <h3>
        {title} <span>{sub ?? 'bấm để chuyển'}</span>
      </h3>
      <div className="dk-sheet" ref={grid}>
        {ids.map((x, i) => (
          <button key={x} type="button" className={cn('dk-bub', cls(x), flagged(x) && 'is-flag', i === current && 'is-cur')} onClick={() => onGo(i)} aria-label={`Câu ${i + 1}`}>
            {i + 1}
          </button>
        ))}
      </div>
      <div className="dk-legend">
        {legend.map(([c, l]) => (
          <span key={c}>
            <i className={cn('dk-dot', c)} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
