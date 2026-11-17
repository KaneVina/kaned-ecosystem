import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Lightbulb, Play, RotateCcw, Send, Shuffle, Timer } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import { clock, fmtScore, grade10, LET, makePerm, poolOf, qLabel, sameSet, shuffle } from './model';
import { AnswerSheet } from './Practice';
import { Inline, Notes, QText, Ring, StudyAids, confetti, hasAids } from './parts';

const COUNTS = [20, 30, 50, 100];
const MINUTES = [15, 30, 45, 60, 90];

interface Ask {
  title: string;
  text: string;
  ok: string;
  danger?: boolean;
  onOk: () => void;
}

export function Exam() {
  const { exam: E } = useDeckCtx();
  if (E.phase === 'run') return <ExamRun />;
  if (E.phase === 'result') return <ExamResult />;
  return <ExamSetup />;
}

function ExamSetup() {
  const { m, state, settings, setSetting, exam: E, setExam } = useDeckCtx();
  const avail = poolOf(m, state, E.ch, 'all', false).length;

  const start = () => {
    let ids = shuffle(poolOf(m, state, E.ch, 'all', false));
    if (E.n) ids = ids.slice(0, E.n);
    const perm = Object.fromEntries(ids.map((id) => [id, makePerm(m.QI.get(id)!, settings.shuf)]));
    const t0 = Date.now();
    setExam({ ...E, phase: 'run', ids, perm, ans: {}, flag: {}, idx: 0, t0, end: E.min ? t0 + E.min * 60_000 : 0, res: null, rf: 'all' });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="dk-setup">
      <div className="panel dk-card dk-setup-card">
        <p className="dk-lead">Đề được rút ngẫu nhiên từ bộ câu hỏi. Bạn chỉ xem đáp án sau khi nộp bài, giống khi thi thật.</p>
        {m.chapters.length > 0 && (
          <div className="dk-field">
            <span className="label">Phạm vi</span>
            <select
              className="select"
              value={E.ch}
              onChange={(e) => {
                const ch = Number(e.target.value);
                const av = poolOf(m, state, ch, 'all', false).length;
                setExam({ ...E, ch, n: E.n > av ? 0 : E.n });
              }}
            >
              <option value={0}>Tất cả chương ({fmtInt(m.Q.length)} câu)</option>
              {m.chapters.map((c) => (
                <option key={c.n} value={c.n}>
                  {c.n ? `Chương ${c.n}: ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="dk-field">
          <span className="label">Số câu</span>
          <div className="dk-chips">
            {COUNTS.map((n) => (
              <button key={n} type="button" className="dk-chip" aria-pressed={E.n === n} disabled={n > avail} onClick={() => setExam({ ...E, n })}>
                {n} câu
              </button>
            ))}
            <button type="button" className="dk-chip" aria-pressed={E.n === 0} onClick={() => setExam({ ...E, n: 0 })}>
              Tất cả {fmtInt(avail)} câu
            </button>
          </div>
        </div>
        <div className="dk-field">
          <span className="label">Thời gian</span>
          <div className="dk-chips">
            {MINUTES.map((n) => (
              <button key={n} type="button" className="dk-chip" aria-pressed={E.min === n} onClick={() => setExam({ ...E, min: n })}>
                {n} phút
              </button>
            ))}
            <button type="button" className="dk-chip" aria-pressed={E.min === 0} onClick={() => setExam({ ...E, min: 0 })}>
              Không giới hạn
            </button>
          </div>
        </div>
        <label className="switch-row dk-field-switch">
          <span>
            <b>Xáo thứ tự đáp án</b>
            <small>Câu có phương án kiểu “Tất cả các phương án trên” giữ nguyên.</small>
          </span>
          <input type="checkbox" className="switch" checked={settings.shuf} onChange={(e) => setSetting('shuf', e.target.checked)} />
        </label>
        <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!avail}>
          <Play className="ic ic-sm" />
          Bắt đầu làm bài
        </button>
      </div>

      <div className="panel dk-panel">
        <h3>
          Lịch sử thi thử <span>{state.exams.length ? `${state.exams.length} lần` : ''}</span>
        </h3>
        {state.exams.length ? (
          <ul className="dk-hist">
            {state.exams.slice(0, 10).map((x) => (
              <li key={x.d}>
                <span>
                  {x.ok}/{x.n} câu đúng
                </span>
                <b className={x.score >= 5 ? 'is-ok' : 'is-bad'}>{fmtScore(x.score)}</b>
                <small>
                  {new Date(x.d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  {x.ch ? `, chương ${x.ch}` : ''} · {clock(x.dur)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dk-hint">Chưa có bài thi nào. Kết quả các lần thi thử sẽ hiện ở đây.</p>
        )}
      </div>
    </div>
  );
}

function ExamRun() {
  const { m, exam: E, setExam } = useDeckCtx();
  const [, tick] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [dir, setDir] = useState(0);
  const id = E.ids[E.idx];
  const q = m.QI.get(id)!;
  const perm = E.perm[id];
  const sel = E.ans[id] ?? [];
  const n = E.ids.length;
  const answered = E.ids.filter((x) => (E.ans[x] ?? []).length).length;
  const now = Date.now();
  const left = E.end ? Math.max(0, E.end - now) : 0;

  const submit = useCallback(() => {
    setExam((s) => {
      if (s.phase !== 'run') return s;
      const dur = Date.now() - s.t0;
      let okN = 0;
      const items = s.ids.map((x) => {
        const qq = m.QI.get(x)!;
        const chosen = s.ans[x] ?? [];
        const ok = chosen.length > 0 && sameSet(chosen, qq.answers);
        if (ok) okN++;
        return { id: x, sel: chosen, ok };
      });
      const score = (okN / s.ids.length) * 10;
      return { ...s, phase: 'result', res: { items, okN, score, dur, fresh: true } };
    });
  }, [setExam, m]);

  useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (E.end && left <= 0) submit();
  }, [E.end, left, submit]);

  const go = (i: number) => {
    if (i < 0 || i >= n) return;
    setDir(i > E.idx ? 1 : -1);
    setExam((s) => ({ ...s, idx: i }));
  };

  const choose = (k: number) => {
    const multi = q.answers.length > 1;
    const next = multi ? (sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]) : sel[0] === k ? [] : [k];
    setExam((s) => ({ ...s, ans: { ...s.ans, [id]: next } }));
    if (!multi && next.length && E.idx < n - 1) {
      const at = E.idx;
      window.setTimeout(() => {
        setDir(1);
        setExam((s) => (s.phase === 'run' && s.idx === at ? { ...s, idx: s.idx + 1 } : s));
      }, 380);
    }
  };

  const askSubmit = () => {
    const blank = n - answered;
    const fl = E.ids.filter((x) => E.flag[x]).length;
    setAsk({
      title: 'Nộp bài?',
      text: blank
        ? `Bạn còn ${blank} câu chưa trả lời${fl ? ` và ${fl} câu đang đánh dấu xem lại` : ''}. Câu bỏ trống tính là sai.`
        : fl
          ? `Bạn đã trả lời hết, còn ${fl} câu đang đánh dấu xem lại.`
          : 'Bạn đã trả lời hết các câu. Nộp bài để xem điểm và đáp án.',
      ok: 'Nộp bài',
      onOk: submit,
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (ask || t.closest('input,select,textarea,[role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      let p = LET.indexOf(key);
      if (p < 0) p = '12345678'.indexOf(key);
      if (p >= 0 && p < perm.length) {
        e.preventDefault();
        choose(perm[p]);
      } else if (key === 'ArrowRight' || key === 'Enter') {
        e.preventDefault();
        if (E.idx < n - 1) go(E.idx + 1);
        else if (key === 'Enter') askSubmit();
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        go(E.idx - 1);
      } else if (key === 'F') setExam((s) => ({ ...s, flag: { ...s.flag, [id]: !s.flag[id] } }));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <div className="dk-exam-bar">
        <span className={cn('dk-timer', E.end && left < 300_000 && 'is-low')} title={E.end ? 'Thời gian còn lại' : 'Thời gian đã làm'}>
          <Timer className="ic ic-sm" />
          <span>{E.end ? clock(left) : clock(now - E.t0)}</span>
          {E.end > 0 && <i style={{ width: `${(left / (E.end - E.t0)) * 100}%` }} />}
        </span>
        <div className="dk-eprog">
          <div>
            <span>
              Đã trả lời <b>{answered} / {n}</b>
            </span>
            <span>{Math.round((answered / n) * 100)}%</span>
          </div>
          <div className="dk-bar">
            <i className="is-violet" style={{ width: `${(answered / n) * 100}%` }} />
          </div>
        </div>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() =>
            setAsk({
              title: 'Huỷ bài thi?',
              text: 'Bài đang làm sẽ không được lưu.',
              ok: 'Huỷ bài',
              danger: true,
              onOk: () => setExam((s) => ({ ...s, phase: 'setup' })),
            })
          }
        >
          Huỷ bài
        </button>
        <button type="button" className="btn btn-primary" onClick={askSubmit}>
          <Send className="ic ic-sm" />
          Nộp bài
        </button>
      </div>

      <div className="dk-study">
        <div className="dk-study-main">
          <article key={id} className={cn('dk-card', dir > 0 ? 'enter-r' : dir < 0 ? 'enter-l' : '')}>
            <div className="dk-qhead">
              <span className="dk-qnum">Câu {E.idx + 1}</span>
              <span className="dk-tag">/ {n}</span>
              {q.answers.length > 1 && <span className="dk-tag is-multi">Chọn {q.answers.length} đáp án</span>}
              <span className="spacer" />
              <button
                type="button"
                className={cn('icon-btn dk-star', E.flag[id] && 'is-on')}
                aria-pressed={Boolean(E.flag[id])}
                aria-label="Đánh dấu xem lại"
                data-tip="Xem lại sau (F)"
                onClick={() => setExam((s) => ({ ...s, flag: { ...s.flag, [id]: !s.flag[id] } }))}
              >
                <Flag className="ic ic-sm" />
              </button>
            </div>
            <QText text={q.text} />
            <ol className="dk-opts">
              {perm.map((k, pos) => (
                <li key={k}>
                  <button type="button" className={cn('dk-opt', sel.includes(k) && 'is-sel')} aria-pressed={sel.includes(k)} onClick={() => choose(k)}>
                    <span className="dk-key">{LET[pos]}</span>
                    <span className="dk-otext"><Inline text={q.options[k]} /></span>
                    <span className="dk-tick" />
                  </button>
                </li>
              ))}
            </ol>
            <div className="dk-qfoot">
              <button type="button" className="btn btn-ghost" onClick={() => go(E.idx - 1)} disabled={E.idx === 0}>
                <ChevronLeft className="ic ic-sm" />
                Câu trước
              </button>
              <span className="spacer" />
              <span className="dk-hint">
                <kbd>A</kbd>–<kbd>D</kbd> chọn, <kbd>F</kbd> đánh dấu
              </span>
              {E.idx < n - 1 ? (
                <button type="button" className="btn btn-secondary" onClick={() => go(E.idx + 1)}>
                  Câu tiếp
                  <ChevronRight className="ic ic-sm" />
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={askSubmit}>
                  <Send className="ic ic-sm" />
                  Nộp bài
                </button>
              )}
            </div>
          </article>
        </div>
        <aside className="dk-side">
          <AnswerSheet
            ids={E.ids}
            current={E.idx}
            cls={(x) => ((E.ans[x] ?? []).length ? 'is-ans' : '')}
            flagged={(x) => Boolean(E.flag[x])}
            onGo={go}
            legend={[
              ['is-ans', 'Đã trả lời'],
              ['is-flag', 'Xem lại'],
            ]}
            title="Phiếu trả lời"
            sub={`${answered} / ${n}`}
          />
        </aside>
      </div>

      <Modal
        open={Boolean(ask)}
        onClose={() => setAsk(null)}
        title={ask?.title ?? ''}
        description={ask?.text}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAsk(null)}>
              Làm tiếp
            </button>
            <button
              type="button"
              className={cn('btn', ask?.danger ? 'btn-danger' : 'btn-primary')}
              onClick={() => {
                const fn = ask?.onOk;
                setAsk(null);
                fn?.();
              }}
            >
              {ask?.ok}
            </button>
          </>
        }
      />
    </>
  );
}

function ExamResult() {
  const { m, exam: E, setExam, progress, startPractice, go, settings } = useDeckCtx();
  const r = E.res!;

  // Record the attempt the first time this result is shown (once, even when effects run twice).
  const recorded = useRef(false);
  useEffect(() => {
    if (!r.fresh || recorded.current) return;
    recorded.current = true;
    for (const x of r.items) if (x.sel.length) progress.record(x.id, x.ok, { streak: false });
    progress.addExam({ d: Date.now(), n: r.items.length, ok: r.okN, score: r.score, dur: r.dur, ch: E.ch });
    setExam((s) => (s.res ? { ...s, res: { ...s.res, fresh: false } } : s));
    window.scrollTo({ top: 0 });
    if (r.score >= 8) window.setTimeout(confetti, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [gw, gc] = grade10(r.score);
  const wrong = r.items.filter((x) => !x.ok);
  const blank = r.items.filter((x) => !x.sel.length).length;
  const list = r.items.map((x, i) => ({ ...x, i })).filter((x) => E.rf === 'all' || (E.rf === 'wrong' ? !x.ok : x.ok));

  return (
    <>
      <section className="dk-result">
        <div className="dk-stamp-wrap">
          <Ring value={r.score * 10} tone={r.score >= 5 ? 'good' : 'low'} size={230}>
            <b className="dk-ring-big">{fmtScore(r.score)}</b>
            <span className="dk-ring-cap">điểm trên thang 10</span>
          </Ring>
          <span className={cn('dk-stamp', gc === 'good' ? 'is-good' : 'is-low', r.fresh && 'is-new')}>{gw}</span>
        </div>
        <div>
          <h2 className="dk-res-title">{r.okN === r.items.length ? 'Đúng tất cả các câu' : `Đúng ${r.okN} trên ${r.items.length} câu`}</h2>
          <p className="dk-lead">
            {wrong.length
              ? `Có ${wrong.length} câu sai${blank ? `, trong đó ${blank} câu bỏ trống` : ''}. Xem lại bên dưới kèm mẹo nhớ, rồi luyện lại các câu sai để nhớ chắc.`
              : 'Bạn đã nắm chắc phần này. Thử một đề khác hoặc tăng số câu.'}
          </p>
          <div className="dk-res-grid">
            <div>
              <b className="is-ok">{r.okN}</b>
              <span>Câu đúng</span>
            </div>
            <div>
              <b className="is-bad">{wrong.length}</b>
              <span>Câu sai</span>
            </div>
            <div>
              <b>{clock(r.dur)}</b>
              <span>Thời gian làm</span>
            </div>
          </div>
          <div className="dk-row">
            {wrong.length > 0 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  startPractice({ custom: { ids: wrong.map((x) => x.id), label: `Đang luyện lại ${wrong.length} câu sai từ bài thi thử` } });
                  go('practice');
                }}
              >
                <RotateCcw className="ic ic-sm" />
                Luyện lại {wrong.length} câu sai
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setExam((s) => ({ ...s, phase: 'setup' }))}>
              <Shuffle className="ic ic-sm" />
              Làm đề mới
            </button>
          </div>
        </div>
      </section>

      <div className="dk-sec-head">
        <h2 className="t-h3">Xem lại bài làm</h2>
        <div className="seg dk-seg" role="group" aria-label="Lọc câu">
          {(
            [
              ['all', 'Tất cả', r.items.length],
              ['wrong', 'Câu sai', wrong.length],
              ['right', 'Câu đúng', r.okN],
            ] as const
          ).map(([v, l, k]) => (
            <button key={v} type="button" aria-pressed={E.rf === v} onClick={() => setExam((s) => ({ ...s, rf: v }))}>
              {l}
              <span className="dk-n">{k}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="dk-qlist">
        {list.map((x) => {
          const q = m.QI.get(x.id)!;
          const perm = E.perm[x.id];
          return (
            <article key={x.id} className="dk-qitem">
              <div className="dk-qhead">
                <span className="dk-qnum">Câu {x.i + 1}</span>
                <span className={cn('dk-tag', x.ok ? 'is-ok' : 'is-bad')}>{x.ok ? 'Đúng' : x.sel.length ? 'Sai' : 'Bỏ trống'}</span>
                <span className="dk-tag">{qLabel(q)} trong bộ đề</span>
              </div>
              <QText text={q.text} small as="h3" />
              <ul className="dk-fopts">
                {perm.map((k, pos) => (
                  <li key={k} className={q.answers.includes(k) ? 'is-right' : x.sel.includes(k) ? 'is-yours' : ''}>
                    <b>{LET[pos]}</b>
                    <span>
                      <Inline text={q.options[k]} />
                      {x.sel.includes(k) && !q.answers.includes(k) && <em> (bạn chọn)</em>}
                    </span>
                  </li>
                ))}
              </ul>
              <Notes q={q} compact />
              {hasAids(q, settings) &&
                (x.ok ? (
                  <details className="dk-tipd">
                    <summary>
                      <Lightbulb className="ic ic-xs" />
                      Mẹo nhớ
                    </summary>
                    <StudyAids q={q} />
                  </details>
                ) : (
                  <StudyAids q={q} />
                ))}
            </article>
          );
        })}
        {!list.length && <p className="dk-hint">Không có câu nào trong mục này.</p>}
      </div>
    </>
  );
}
