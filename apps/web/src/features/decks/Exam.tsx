import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { chapterTitle } from '@kaned/shared';
import { BookOpen, CalendarClock, ChevronLeft, ChevronRight, Flag, Lightbulb, ListChecks, Play, RotateCcw, Send, Shuffle, Timer } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/providers/AuthProvider';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import { clock, fmtScore, grade10, LET, makePerm, NO_SLICE, poolOf, qLabel, sameSet, shuffle } from './model';
import { AnswerSheet } from './Practice';
import { Inline, Notes, PaperCard, QText, Ring, StudyAids, confetti, hasAids } from './parts';

const COUNTS = [20, 30, 50, 100];
const MINUTES = [15, 30, 45, 60, 90];
const MAX_MINUTES = 300;

interface Ask {
  title: string;
  text: ReactNode;
  ok: string;
  danger?: boolean;
  onOk: () => void;
  /** Label of the other button (default “Làm tiếp”) and what it does besides closing. */
  cancel?: string;
  onCancel?: () => void;
}

export function Exam() {
  const { exam: E } = useDeckCtx();
  if (E.phase === 'run') return <ExamRun />;
  if (E.phase === 'result') return <ExamResult />;
  return <ExamSetup />;
}

/**
 * "Tự nhập" box beside the preset chips. The number can never leave 1..max:
 * typing past the max snaps to the max and says why, and an empty or zero box
 * goes back to the current choice when it loses focus.
 */
function CustomNumber({
  value,
  presets,
  max,
  unit,
  noun,
  onChange,
}: {
  value: number;
  presets: number[];
  max: number;
  unit: string;
  noun: string;
  onChange: (n: number) => void;
}) {
  const shown = (v: number) => (v > 0 && !presets.includes(v) && v < max + 1 ? String(v) : '');
  const [draft, setDraft] = useState(() => shown(value));
  const [clamped, setClamped] = useState(false);
  const id = useId();
  const parsed = draft === '' ? NaN : Number(draft);

  // A chip (or a scope change) picked another value: the box should not keep the old number.
  useEffect(() => {
    if (parsed !== value) {
      setDraft(shown(value));
      setClamped(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const hint = clamped
    ? `Tối đa ${fmtInt(max)} ${noun}, đã đặt về mức này.`
    : parsed === 0
      ? 'Nhập từ 1 trở lên.'
      : `Nhập từ 1 đến ${fmtInt(max)} ${noun}.`;

  return (
    <div className={cn('dk-custom', (clamped || parsed === 0) && 'is-warn', Number.isFinite(parsed) && parsed > 0 && 'is-set')}>
      <label htmlFor={id}>Tự nhập</label>
      <span className="dk-custom-box">
        <input
          id={id}
          className="dk-custom-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Số"
          value={draft}
          disabled={max < 1}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 4);
            const n = raw === '' ? NaN : Number(raw);
            if (Number.isFinite(n) && n > max) {
              setDraft(String(max));
              setClamped(true);
              onChange(max);
              return;
            }
            setClamped(false);
            setDraft(raw);
            if (Number.isFinite(n) && n >= 1) onChange(n);
          }}
          onBlur={() => {
            if (!(parsed >= 1)) setDraft(shown(value));
            setClamped(false);
          }}
        />
        <span aria-hidden>{unit}</span>
      </span>
      <small id={`${id}-hint`} role={clamped ? 'alert' : undefined}>
        {hint}
      </small>
    </div>
  );
}

function ExamSetup() {
  const { m, state, settings, setSetting, exam: E, setExam } = useDeckCtx();
  const avail = poolOf(m, state, E.ch, 'all', false, NO_SLICE, true).length;

  const { user } = useAuth();
  const { deck } = useDeckCtx();
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!confirming) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [confirming]);
  const count = E.n ? Math.min(E.n, avail) : avail;

  const start = () => {
    // Fullscreen has to be requested from the click itself.
    try {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      /* not supported (e.g. iPhone): the exam still runs, just not fullscreen */
    }
    let ids = shuffle(poolOf(m, state, E.ch, 'all', false, NO_SLICE, true));
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
                const av = poolOf(m, state, ch, 'all', false, NO_SLICE, true).length;
                setExam({ ...E, ch, n: E.n > av ? 0 : E.n });
              }}
            >
              <option value={0}>Tất cả chương ({fmtInt(m.Q.filter((x) => !x.written).length)} câu)</option>
              {m.chapters.map((c) => (
                <option key={c.n} value={c.n}>
                  {chapterTitle(c)}
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
            <button type="button" className="dk-chip" aria-pressed={E.n === 0 || E.n >= avail} onClick={() => setExam({ ...E, n: 0 })}>
              Tất cả {fmtInt(avail)} câu
            </button>
          </div>
          <CustomNumber value={E.n} presets={COUNTS} max={avail} unit="câu" noun="câu" onChange={(n) => setExam({ ...E, n })} />
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
          <CustomNumber value={E.min} presets={MINUTES} max={MAX_MINUTES} unit="phút" noun="phút" onChange={(min) => setExam({ ...E, min })} />
        </div>
        <label className="switch-row dk-field-switch">
          <span>
            <b>Xáo thứ tự đáp án</b>
            <small>Câu có phương án kiểu “Tất cả các phương án trên” giữ nguyên.</small>
          </span>
          <input type="checkbox" className="switch" checked={settings.shuf} onChange={(e) => setSetting('shuf', e.target.checked)} />
        </label>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setConfirming(true)} disabled={!avail}>
          <Play className="ic ic-sm" />
          Bắt đầu làm bài
        </button>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Xác nhận vào phòng thi"
        description="Kiểm tra thông tin trước khi bắt đầu. Đồng hồ chạy ngay khi bạn xác nhận."
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
              Quay lại
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setConfirming(false);
                start();
              }}
            >
              <Play className="ic ic-sm" />
              Xác nhận, bắt đầu thi
            </button>
          </>
        }
      >
        <dl className="dk-confirm">
          <div>
            <dt>Thí sinh</dt>
            <dd>{user?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Môn thi</dt>
            <dd>
              {deck.subject.code} · {deck.subject.nameVi}
            </dd>
          </div>
          <div>
            <dt>Số câu</dt>
            <dd>{fmtInt(count)} câu trắc nghiệm</dd>
          </div>
          <div>
            <dt>Thời gian</dt>
            <dd>
              {E.min ? (
                <>
                  {E.min} phút
                  <small>
                    {hm(now)} – {hm(now + E.min * 60_000)}, {dmy(now)}
                  </small>
                </>
              ) : (
                <>
                  Không giới hạn
                  <small>
                    Bắt đầu lúc {hm(now)}, {dmy(now)}
                  </small>
                </>
              )}
            </dd>
          </div>
        </dl>
        <ul className="dk-confirm-rules">
          <li>Bài thi mở toàn màn hình, chỉ hiện đồng hồ, tiến độ và danh sách câu hỏi.</li>
          <li>
            <b>Thoát giữa chừng thì bài không được lưu.</b>
          </li>
        </ul>
      </Modal>

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
  const { deck, m, exam: E, setExam } = useDeckCtx();
  const { user } = useAuth();
  const [, tick] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [dir, setDir] = useState(0);

  // --- Exam-room mode: nothing but the exam on screen, and leaving costs the attempt. ---
  const leave = useCallback(
    (steps = 0) => {
      setExam((x) => ({ ...x, phase: 'setup' }));
      if (steps) window.history.go(-steps);
    },
    [setExam],
  );
  useEffect(() => {
    document.documentElement.classList.add('exam-live');
    window.scrollTo({ top: 0 });
    return () => {
      document.documentElement.classList.remove('exam-live');
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  // Closing or reloading the tab: the browser's own confirmation.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);
  // The Back button: stay on the exam and ask first.
  useEffect(() => {
    window.history.pushState({ kanedExam: true }, '');
    const onPop = () => {
      window.history.pushState({ kanedExam: true }, '');
      setAsk({
        title: 'Thoát khỏi bài thi?',
        text: <>Nếu thoát, <b className="dk-blank">bài đang làm sẽ không được lưu</b>.</>,
        ok: 'Thoát, không lưu',
        danger: true,
        cancel: 'Tiếp tục thi',
        onOk: () => leave(2),
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [leave]);
  // Leaving fullscreen with Esc counts as trying to leave.
  useEffect(() => {
    let was = Boolean(document.fullscreenElement);
    const onFs = () => {
      if (document.fullscreenElement) {
        was = true;
        return;
      }
      if (!was) return;
      was = false;
      setAsk({
        title: 'Bạn đã thoát toàn màn hình',
        text: <>Thoát bài thi thì <b className="dk-blank">bài đang làm sẽ không được lưu</b>. Bạn muốn làm tiếp hay thoát?</>,
        ok: 'Thoát, không lưu',
        danger: true,
        cancel: 'Làm tiếp, vào lại toàn màn hình',
        onCancel: () => void document.documentElement.requestFullscreen?.().catch(() => {}),
        onOk: () => leave(),
      });
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [leave]);

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
        ? (
            <>
              Bạn còn <b className="dk-blank">{blank} câu chưa trả lời</b>
              {fl ? ` và ${fl} câu đang đánh dấu xem lại` : ''}. Câu bỏ trống tính là sai.
            </>
          )
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
      <div className="dk-room">
      <div className="dk-room-top">
        <div className="dk-room-grid">
          <section className="dk-rcard dk-rinfo" aria-label="Thông tin bài thi">
            <div className="dk-rwho">
              <span className="dk-avatar" aria-hidden>
                {initials(user?.name)}
              </span>
              <div>
                <b>{user?.name ?? 'Thí sinh'}</b>
                <span>Thí sinh</span>
              </div>
              <span className="dk-exam-subj" title={deck.subject.nameVi}>
                <i style={{ background: deck.subject.university.color }} />
                {deck.subject.code}
              </span>
            </div>
            <dl className="dk-rfacts">
              <div>
                <dt>
                  <BookOpen className="ic ic-sm" />
                  Môn thi
                </dt>
                <dd>{deck.subject.nameVi}</dd>
              </div>
              <div>
                <dt>
                  <ListChecks className="ic ic-sm" />
                  Số câu
                </dt>
                <dd>{n} câu</dd>
              </div>
              <div>
                <dt>
                  <CalendarClock className="ic ic-sm" />
                  {E.end ? 'Khung giờ' : 'Bắt đầu'}
                </dt>
                <dd>
                  {hm(E.t0)}
                  {E.end ? ` – ${hm(E.end)}` : ''} · {dmy(E.t0)}
                </dd>
              </div>
            </dl>
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
          </section>
          <section className="dk-rcard dk-rtimer" aria-label="Đồng hồ">
            <span
              className={cn('dk-timer', E.end > 0 && 'has-ring', E.end && left < 300_000 && 'is-low')}
              style={E.end > 0 ? ({ ['--p' as string]: `${Math.max(0, Math.min(1, left / (E.end - E.t0))) * 360}deg` } as CSSProperties) : undefined}
              title={E.end ? 'Thời gian còn lại' : 'Thời gian đã làm'}
            >
              <Timer className="ic ic-sm" />
              <span>{E.end ? clock(left) : clock(now - E.t0)}</span>
            </span>
            <small>{E.end ? 'Thời gian còn lại' : 'Thời gian đã làm'}</small>
            <div className="dk-exam-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setAsk({
                    title: 'Huỷ bài thi?',
                    text: 'Bài đang làm sẽ không được lưu.',
                    ok: 'Huỷ bài',
                    danger: true,
                    onOk: () => leave(),
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
          </section>
        </div>
      </div>
      <div className="dk-study">
        <div className="dk-study-main">
          {q.paper != null && <PaperCard q={q} />}
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
            <ol className={cn('dk-opts', q.answers.length > 1 && 'is-multi')}>
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
          <ExamSheet ids={E.ids} ans={E.ans} flag={E.flag} current={E.idx} onGo={go} />
        </aside>
      </div>
      </div>

      <Modal
        open={Boolean(ask)}
        onClose={() => setAsk(null)}
        title={ask?.title ?? ''}
        description={ask?.text}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const fn = ask?.onCancel;
                setAsk(null);
                fn?.();
              }}
            >
              {ask?.cancel ?? 'Làm tiếp'}
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

const hm = (ts: number) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dmy = (ts: number) => new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

function initials(name?: string | null) {
  const w = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[w.length - 2][0] + w[w.length - 1][0]).toUpperCase();
}

type SheetFilter = 'all' | 'todo' | 'flag';

function ExamSheet({
  ids,
  ans,
  flag,
  current,
  onGo,
}: {
  ids: string[];
  ans: Record<string, number[]>;
  flag: Record<string, boolean>;
  current: number;
  onGo: (i: number) => void;
}) {
  const [f, setF] = useState<SheetFilter>('all');
  const done = (x: string) => (ans[x] ?? []).length > 0;
  const nDone = ids.filter(done).length;
  const nFlag = ids.filter((x) => flag[x]).length;
  const nTodo = ids.length - nDone;
  const show = (x: string) => f === 'all' || (f === 'todo' && !done(x)) || (f === 'flag' && flag[x]);
  const nextTodo = () => {
    for (let k = 1; k <= ids.length; k++) {
      const i = (current + k) % ids.length;
      if (!done(ids[i])) return i;
    }
    return -1;
  };
  const nx = nextTodo();
  const tabs: [SheetFilter, string, number][] = [
    ['all', 'Tất cả', ids.length],
    ['todo', 'Chưa làm', nTodo],
    ['flag', 'Đánh dấu', nFlag],
  ];
  return (
    <div className="dk-rcard dk-xsheet">
      <div className="dk-xs-head">
        <h3>Phiếu trả lời</h3>
        <span>
          <b>{nDone}</b> / {ids.length}
        </span>
      </div>
      <div className="dk-xs-tabs" role="tablist">
        {tabs.map(([k, label, c]) => (
          <button key={k} type="button" role="tab" aria-selected={f === k} className={cn(f === k && 'is-on')} onClick={() => setF(k)}>
            {label}
            <em>{c}</em>
          </button>
        ))}
      </div>
      <div className="dk-xs-grid">
        {ids.map((x, i) => (
          <button
            key={x}
            type="button"
            className={cn('dk-xq', done(x) && 'is-ans', flag[x] && 'is-flag', i === current && 'is-cur', !show(x) && 'is-dim')}
            aria-current={i === current ? 'true' : undefined}
            aria-label={`Câu ${i + 1}${done(x) ? ', đã trả lời' : ', chưa trả lời'}${flag[x] ? ', đánh dấu xem lại' : ''}`}
            onClick={() => onGo(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="dk-legend">
        <span><i className="dk-lg is-cur" />Đang làm</span>
        <span><i className="dk-lg is-ans" />Đã trả lời</span>
        <span><i className="dk-lg is-flag" />Xem lại</span>
      </div>
      <button type="button" className="btn btn-secondary dk-xs-next" disabled={nx < 0} onClick={() => nx >= 0 && onGo(nx)}>
        {nx < 0 ? 'Đã trả lời hết' : 'Tới câu chưa làm kế tiếp'}
        {nx >= 0 && <ChevronRight className="ic ic-sm" />}
      </button>
    </div>
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
