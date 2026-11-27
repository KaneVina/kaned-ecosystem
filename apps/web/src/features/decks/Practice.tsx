import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Flame, RotateCcw, Star, Timer, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buzz } from '@/lib/haptics';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import type { Grade } from '@kaned/shared';
import { beep, CONFIDENCE, fmtWait, LET, makePerm, qLabel, sameSet, type StudyQuestion } from './model';
import { Banner, FilterBar, SeenTags, Inline, KindTags, Notes, PaperCard, QuestionText, StudyAids, StudyEmpty, HintToggle } from './parts';
import { marksOf, PeQuestion, PeTools, PeWorkspace, splitLang, usePeView, type SelfScale } from './pe';

export function Practice() {
  const { m, state, settings, practice: P, setPractice, startPractice, progress, go, setExam } = useDeckCtx();
  const [sel, setSel] = useState<number[]>([]);
  const [dir, setDir] = useState(0);
  const autoTimer = useRef<number>();
  const id = P.ids[P.idx];
  const q = id ? m.QI.get(id) : undefined;
  const res = id ? P.res[id] : undefined;
  const multi = (q?.answers.length ?? 0) > 1;
  const written = Boolean(q?.written);
  // Written (PE) questions: whether the learner has finished writing and is grading.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [view, setView] = usePeView();
  const lang = view.trans ? 'both' : 'en';
  const revealed = Boolean(q && (opened[q.id] || res));

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
      buzz(ok ? 'ok' : 'bad');
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

  /** A written question, checked by the learner against the model answer. */
  const selfGrade = useCallback(
    (g: Grade) => {
      if (!q || P.res[q.id]) return;
      const ok = g > 1;
      const base = progress.state.st[q.id] ?? null;
      setPractice((s) => ({ ...s, res: { ...s.res, [q.id]: { sel: [], ok, g, base } } }));
      progress.record(q.id, ok, { grade: g });
      if (settings.sound) beep(ok);
      buzz(ok ? 'ok' : 'bad');
    },
    [q, P.res, setPractice, progress, settings.sound],
  );

  /** Jump to another question of the same paper: inside this session, or a session of the whole paper. */
  const goTo = useCallback(
    (qid: string) => {
      const i = P.ids.indexOf(qid);
      setSel([]);
      if (i >= 0) {
        setDir(i > P.idx ? 1 : -1);
        setPractice((s) => ({ ...s, idx: i }));
        return;
      }
      const paper = m.QI.get(qid)?.paper;
      const ids = paper != null ? (m.paperQuestions.get(paper) ?? [qid]) : [qid];
      const p = paper != null ? m.papers.get(paper) : undefined;
      startPractice({ custom: { ids, label: p ? `Đang luyện Đề ${p.n}: ${p.title}` : `Câu ${qid}` } });
      setPractice((s) => ({ ...s, idx: Math.max(0, s.ids.indexOf(qid)) }));
    },
    [P.ids, P.idx, setPractice, m, startPractice],
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
      if (written) {
        const sg = !res && revealed ? (q.solution ? SELF : SELF_FRAME).find((c) => c.key === key) : undefined;
        if (sg) {
          e.preventDefault();
          selfGrade(sg.g);
        } else if (key === 'Enter' && res) {
          e.preventDefault();
          move(1);
        } else if (key === 'ArrowRight') {
          e.preventDefault();
          move(1);
        } else if (key === 'ArrowLeft') {
          e.preventDefault();
          move(-1);
        } else if (key === 'M') toggleMark();
        return;
      }
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
    <FilterBar ch={P.ch} scope={P.scope} slice={P.slice} order={P.order} onChange={(o) => startPractice(o)} />
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
            <button type="button" className="btn btn-secondary" onClick={() => startPractice({ ch: P.ch, scope: P.scope, slice: P.slice, order: P.order, custom: P.custom })}>
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
  const marks = written ? marksOf(q.text) : null;
  const paper = q.paper != null ? m.papers.get(q.paper) : undefined;
  const bilingual = written && Boolean(splitLang(q.text) || (paper && splitLang(paper.body)));

  return (
    <>
      {header}
      <div className={cn('dk-study', written && 'is-pe')}>
        <div className="dk-study-main">
          <div className={cn('dk-progress', written && 'pe-top')}>
            <span>
              <b>{P.idx + 1}</b> / {fmtInt(P.ids.length)}
            </span>
            <div className="dk-bar">
              <i className="is-ok" style={{ width: `${((P.idx + 1) / P.ids.length) * 100}%` }} />
            </div>
            {written && <PeTools view={view} onChange={setView} canTranslate={bilingual} canFrame={Boolean(q.frame) && !revealed} />}
          </div>

          <PaperCard q={q} lang={written ? lang : undefined} onGo={goTo} onPracticeAll={P.custom?.ids.join() === (m.paperQuestions.get(q.paper ?? -1) ?? []).join() ? undefined : (ids, label) => startPractice({ custom: { ids, label } })} />
          <article key={q.id} className={cn('dk-card', res && 'is-locked', written && 'is-written', dir > 0 ? 'enter-r' : dir < 0 ? 'enter-l' : '')}>
            <div className="dk-qhead">
              <span className="dk-qnum">{qLabel(q)}</span>
              <KindTags q={q} />
              <SeenTags q={q} />
              {q.parent && <span className="dk-tag is-var">Kiểu hỏi khác</span>}
              {multi && <span className="dk-tag is-multi">Chọn {q.answers.length} đáp án</span>}
              {written && marks && <span className="dk-tag pe-marks">{marks} điểm</span>}
              <span className="spacer" />
              <button type="button" className={cn('icon-btn dk-star', isMarked && 'is-on')} aria-pressed={isMarked} aria-label="Đánh dấu câu này" data-tip="Đánh dấu (M)" onClick={toggleMark}>
                <Star className="ic ic-sm" />
              </button>
            </div>
            {written ? <PeQuestion q={q} lang={lang} /> : <QuestionText q={q} />}
            {res && written && (
              <div className={cn('dk-fb', res.ok ? (res.g === 2 ? 'is-mid' : 'is-ok') : 'is-bad')}>
                <div className="dk-fb-head">
                  {res.ok ? <Check className="ic" /> : <X className="ic" />}
                  {(q.solution ? SELF : SELF_FRAME).find((c) => c.g === res.g)?.verdict ?? (res.ok ? 'Làm được' : 'Chưa làm được')}
                </div>
                {settings.srs && <p className="dk-conf-next">{res.ok ? `Hẹn ôn lại sau ${fmtWait((state.st[q.id]?.n ?? Date.now()) - Date.now())}.` : `Câu này vào mục Cần ôn và sẽ quay lại sau ${fmtWait((state.st[q.id]?.n ?? Date.now()) - Date.now())}.`}</p>}
                <Notes q={q} />
              </div>
            )}
            {written ? (
              <PeWorkspace
                key={`pe-${q.id}`}
                q={q}
                scale={q.solution ? SELF : SELF_FRAME}
                revealed={revealed}
                onReveal={() => setOpened((o) => ({ ...o, [q.id]: true }))}
                onBack={() => setOpened((o) => ({ ...o, [q.id]: false }))}
                graded={res?.g}
                onGrade={selfGrade}
                frameOpen={view.frame}
                onFrame={(frame) => setView({ frame })}
              />
            ) : (
            <ol className={cn('dk-opts', multi && 'is-multi')}>
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
            )}

            {!res && !(written && revealed) && <HintToggle key={q.id} hint={q.hint} />}
            {res && !written && (
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
                {written ? (
                  res ? (
                    <>
                      <kbd>Enter</kbd> câu tiếp
                    </>
                  ) : revealed ? (
                    <>
                      Tự chấm: <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>
                    </>
                  ) : (
                    'Viết xong thì bấm Làm xong, tự chấm'
                  )
                ) : multi && !res ? (
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

        {!written && (
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
                <Bump value={okN} className="is-ok" />
                <span>Đúng</span>
              </div>
              <div>
                <Bump value={done - okN} className="is-bad" />
                <span>Sai</span>
              </div>
              <div>
                <Bump value={state.streak} className={state.streak >= 3 ? 'is-hot' : undefined} />
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
        )}
      </div>
    </>
  );
}

/**
 * After a right answer: how sure was it? Sure answers come back later and
 * later; guesses come back soon, as if they had been wrong.
 */
/** A counter that bumps and floats a "+1" when it goes up. */
function Bump({ value, className }: { value: number; className?: string }) {
  const prev = useRef(value);
  const [burst, setBurst] = useState<{ n: number; d: number } | null>(null);
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (d <= 0) return;
    setBurst({ n: value, d });
    const t = window.setTimeout(() => setBurst(null), 800);
    return () => window.clearTimeout(t);
  }, [value]);
  return (
    <b className={cn(className, 'dk-bump-wrap')}>
      <em key={burst ? `s${burst.n}` : 'rest'} className={cn('dk-num', burst && 'dk-bump')}>
        {fmtInt(value)}
      </em>
      {burst && (
        <i key={`p${burst.n}`} className="dk-plus" aria-hidden>
          +{fmtInt(burst.d)}
        </i>
      )}
    </b>
  );
}

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

/** How a written answer compares with the model answer: the learner's own grade. */
const SELF: SelfScale = [
  { g: 3, label: 'Làm đúng', verdict: 'Bạn làm đúng', key: '1', tone: 'is-sure' },
  { g: 2, label: 'Gần đúng', verdict: 'Gần đúng, còn thiếu một chút', key: '2', tone: 'is-unsure' },
  { g: 1, label: 'Chưa làm được', verdict: 'Chưa làm được', key: '3', tone: 'is-guess' },
];
/** No model answer: the learner checks their work against the frame instead. */
const SELF_FRAME: typeof SELF = [
  { g: 3, label: 'Đủ ý', verdict: 'Bài của bạn đủ ý theo khung', key: '1', tone: 'is-sure' },
  { g: 2, label: 'Còn thiếu', verdict: 'Còn thiếu vài ý so với khung', key: '2', tone: 'is-unsure' },
  { g: 1, label: 'Chưa làm được', verdict: 'Chưa làm được', key: '3', tone: 'is-guess' },
];
