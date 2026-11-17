import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Flame, RotateCcw, Star, Timer, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import type { Grade } from '@kaned/shared';
import { beep, CONFIDENCE, fmtWait, LET, makePerm, qLabel, sameSet } from './model';
import { Banner, FilterBar, Inline, Notes, QText, StudyAids, StudyEmpty, HintToggle } from './parts';

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
      // With scheduling on, a right answer counts as "unsure" until the learner says otherwise.
      const g: Grade = !ok ? 1 : settings.srs ? 2 : 3;
      const base = progress.state.st[q.id] ?? null;
      setPractice((s) => ({ ...s, res: { ...s.res, [q.id]: { sel: chosen, ok, g, base } } }));
      progress.record(q.id, ok, { grade: g });
      if (settings.sound) beep(ok);
      if (ok && settings.auto && !settings.srs) {
        const at = P.idx;
        autoTimer.current = window.setTimeout(() => {
          setPractice((s) => (s.idx === at ? (s.idx + 1 >= s.ids.length ? { ...s, finished: true } : { ...s, idx: s.idx + 1 }) : s));
          setSel([]);
          setDir(1);
        }, 1100);
      }
    },
    [q, P.res, P.idx, setPractice, progress, settings.sound, settings.auto, settings.srs],
  );

  /** How sure the learner was about a right answer: changes when it comes back. */
  const confide = useCallback(
    (g: Grade) => {
      const r = q && P.res[q.id];
      if (!q || !r?.ok) return;
      if (r.g !== g) {
        setPractice((s) => ({ ...s, res: { ...s.res, [q.id]: { ...r, g } } }));
        progress.record(q.id, true, { grade: g, base: r.base ?? null });
      }
      if (settings.auto) {
        window.clearTimeout(autoTimer.current);
        const at = P.idx;
        autoTimer.current = window.setTimeout(() => {
          setPractice((s) => (s.idx === at ? (s.idx + 1 >= s.ids.length ? { ...s, finished: true } : { ...s, idx: s.idx + 1 }) : s));
          setSel([]);
          setDir(1);
        }, 550);
      }
    },
    [q, P.res, P.idx, setPractice, progress, settings.auto],
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
      const conf = res?.ok && settings.srs ? CONFIDENCE.find((c) => c.key === key) : undefined;
      if (conf) {
        e.preventDefault();
        confide(conf.g);
        return;
      }
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
      .filter(([, r]) => !r.ok || r.g === 1)
      .map(([k]) => k);
    const guessed = Object.values(P.res).filter((r) => r.ok && r.g === 1).length;
    const missed = wrong.length - guessed;
    const again = guessed ? (missed ? 'câu sai và câu đoán' : 'câu đoán') : 'câu sai';
    return (
      <>
        {header}
        <div className="dk-empty dk-finish">
          <h3>
            Xong {fmtInt(done)} / {fmtInt(P.ids.length)} câu
          </h3>
          <p>
            Bạn trả lời đúng {fmtInt(okN)} câu{guessed ? ` (${fmtInt(guessed)} câu đoán)` : ''}
            {missed ? `, sai ${fmtInt(missed)} câu` : ''}
            {wrong.length ? `. Luyện lại ngay các ${again} để nhớ lâu hơn.` : '. Làm tốt lắm.'}
          </p>
          <div className="dk-row-center">
            {wrong.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={() => startPractice({ custom: { ids: wrong, label: `Đang luyện lại ${wrong.length} ${again} của lượt trước` } })}>
                <RotateCcw className="ic ic-sm" />
                Luyện lại {fmtInt(wrong.length)} {again}
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
            <QText text={q.text} />
            <ol className="dk-opts">
              {perm.map((k, pos) => {
                const picked = res ? res.sel.includes(k) : sel.includes(k);
                const right = q.answers.includes(k);
                const cls = res ? (right ? 'is-ok' : picked ? 'is-bad' : 'is-dim') : picked ? 'is-sel' : '';
                return (
                  <li key={k}>
                    <button type="button" className={cn('dk-opt', cls, res && right && !res.sel.includes(k) && 'is-reveal')} onClick={() => choose(k)} disabled={Boolean(res)}>
                      <span className="dk-key">{LET[pos]}</span>
                      <span className="dk-otext"><Inline text={q.options[k]} /></span>
                      <span className="dk-tick">{res && right ? <Check className="ic" /> : res && picked ? <X className="ic" /> : null}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {!res && <HintToggle key={q.id} hint={q.hint} />}
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
                  {q.answers.length === 1 && (
                    <>
                      . <Inline text={q.options[q.answers[0]]} />
                    </>
                  )}
                </p>
                {settings.srs && <Confidence res={res} due={state.st[q.id]?.n} onPick={confide} />}
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
            cls={(x) => (P.res[x] ? (P.res[x].ok ? (settings.srs && P.res[x].g === 1 ? 'is-guess' : 'is-ok') : 'is-bad') : '')}
            flagged={(x) => Boolean(state.mk[x])}
            onGo={(i) => {
              setSel([]);
              setDir(i > P.idx ? 1 : -1);
              setPractice((s) => ({ ...s, idx: i }));
            }}
            legend={[
              ['is-ok', 'Đúng'],
              ...(settings.srs ? [['is-guess', 'Đoán'] as [string, string]] : []),
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
            {settings.srs && (
              <div>
                <span>Chắc, phân vân, đoán</span>
                <span>
                  <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>
                </span>
              </div>
            )}
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

/**
 * After a right answer: how sure was it? Sure answers come back later and
 * later; guesses come back soon, as if they had been wrong.
 */
function Confidence({ res, due, onPick }: { res: { ok: boolean; g?: Grade }; due?: number; onPick: (g: Grade) => void }) {
  const wait = due ? fmtWait(due - Date.now()) : '';
  if (!res.ok) {
    return <p className="dk-conf-next">Câu này vào mục Cần ôn và sẽ quay lại sau {wait}.</p>;
  }
  return (
    <div className="dk-conf">
      <div className="dk-conf-row" role="group" aria-label="Bạn chắc đến đâu?">
        <span className="dk-conf-q">Bạn chắc đến đâu?</span>
        {CONFIDENCE.map((c) => (
          <button key={c.g} type="button" className={cn('dk-conf-btn', c.tone)} aria-pressed={res.g === c.g} onClick={() => onPick(c.g)}>
            <kbd>{c.key}</kbd>
            {c.label}
          </button>
        ))}
      </div>
      <p className="dk-conf-next">
        {res.g === 1 ? `Câu đoán được tính như chưa thuộc, sẽ quay lại sau ${wait}.` : `Hẹn ôn lại sau ${wait}.`} Càng chắc, lịch ôn càng giãn ra.
      </p>
    </div>
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
