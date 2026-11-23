import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock, ArrowLeft, ArrowRight, CircleAlert, Clock, Flag, Lock, Maximize, Megaphone, MonitorSmartphone, PauseCircle, Send, ShieldCheck, Wifi, WifiOff,
} from 'lucide-react';
import {
  PRESET_LABEL, clockText, fmtVnFull, formatRoomCode, type AttemptStateDto, type HeartbeatResponse, type PaperDto,
} from '@kaned/shared';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { cn } from '@/lib/cn';
import { Inline, QText } from '@/features/decks/parts';
import { vec, vecKeys } from './api';
import { canFullscreen, enterFullscreen, serverNow, syncClock, useAutosave, useExamGuard, useHeartbeat, useServerTick } from './hooks';
import './vec.css';

const LETTERS = 'ABCDEFGH';

export default function RoomPage() {
  const { attemptId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const tick = useServerTick(1000);
  const q = useQuery({
    queryKey: vecKeys.attempt(attemptId),
    queryFn: async () => {
      const sent = Date.now();
      const r = await vec.attempt(attemptId);
      syncClock(r.serverNow, sent, Date.now());
      return r;
    },
    refetchInterval: (query) => {
      const s = query.state.data?.state;
      return s === 'LOBBY' ? 5000 : s === 'SUSPENDED' ? 6000 : false;
    },
    staleTime: 0,
    retry: 1,
  });
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: vecKeys.attempt(attemptId) }), [qc, attemptId]);

  useEffect(() => {
    const s = q.data?.state;
    if (s === 'SUBMITTED' || s === 'AUTO_SUBMITTED' || s === 'FORCE_SUBMITTED') nav(`/app/vec/result/${attemptId}`, { replace: true });
  }, [q.data?.state, attemptId, nav]);

  if (q.isLoading) return <div className="vec-room-page"><div className="vec-center"><Skeleton style={{ height: 260, width: 'min(520px, 90vw)' }} /></div></div>;
  if (q.isError || !q.data) {
    return (
      <div className="vec-room-page">
        <div className="vec-center">
          <div className="vec-note">
            <CircleAlert className="ic" />
            <h2>Không mở được bài thi</h2>
            <p>{(q.error as Error | null)?.message ?? 'Bài thi không tồn tại hoặc không thuộc về bạn.'}</p>
            <Link to="/app/vec" className="btn btn-primary">Về Phòng thi ảo</Link>
          </div>
        </div>
      </div>
    );
  }
  const a = q.data;
  if (a.state === 'VOIDED') {
    return (
      <div className="vec-room-page">
        <div className="vec-center">
          <div className="vec-note">
            <ShieldCheck className="ic" />
            <h2>Bài thi này đã bị hủy</h2>
            <p>Giảng viên đã hủy hoặc cho bạn rời khỏi lượt thi này. Nếu cần làm lại, hãy liên hệ giảng viên.</p>
            <Link to="/app/vec/history" className="btn btn-primary">Xem lịch sử</Link>
          </div>
        </div>
      </div>
    );
  }
  if (a.state === 'LOBBY') return <Lobby a={a} now={tick} onStarted={refresh} />;
  if (a.state === 'SUSPENDED') return <LockedScreen a={a} onChange={refresh} />;
  if (a.state === 'IN_PROGRESS') return <ExamView key={a.id + a.state} a={a} onChange={refresh} />;
  return null;
}

/* ───────────────────────────── lobby ───────────────────────────── */

function Lobby({ a, now, onStarted }: { a: AttemptStateDto; now: number; onStarted: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const s = a.session;
  const live = s.status === 'LIVE' && now >= s.startsAt;
  const closed = s.status === 'ENDED' || s.status === 'CANCELLED';
  const wide = window.innerWidth >= 900;
  const desktopOk = !s.settings.integrity.desktopOnly || wide;
  const fsOk = canFullscreen() || s.settings.integrity.allowUnsupportedFullscreen;
  const left = s.startsAt - now;
  const retake = a.attemptNo > 1;

  const start = async () => {
    setBusy(true);
    setErr('');
    try {
      if (canFullscreen()) await enterFullscreen();
      const r = await vec.start(a.id);
      if (r.connectionId) sessionStorage.setItem(`vec:conn:${a.id}`, r.connectionId);
      onStarted();
    } catch (e) {
      setErr((e as Error).message);
      toast.error('Chưa bắt đầu được', (e as Error).message);
      if (document.fullscreenElement) void document.exitFullscreen();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vec-room-page">
      <div className="vec-lobby">
        <header className="vec-lobby-head">
          <span className="vec-chip">Phòng chờ</span>
          <h1>{s.title}</h1>
          <p>{s.subjectCode} · {s.subjectName} · GV {s.lecturerDisplay}</p>
        </header>
        <div className="vec-lobby-grid">
          <section className="vec-card">
            <h2>Thông tin bài thi</h2>
            <dl className="vec-dl">
              <div><dt>Thí sinh</dt><dd>{a.candidate.fullName}</dd></div>
              <div><dt>Mã sinh viên</dt><dd>{a.candidate.studentCode || '—'}</dd></div>
              <div><dt>Mã đề</dt><dd><b className="vec-code">{a.paperCode}</b></dd></div>
              <div><dt>Lượt thi</dt><dd>{a.attemptNo}/{a.maxAttempts}</dd></div>
              <div><dt>Số câu</dt><dd>{a.total} câu</dd></div>
              <div><dt>Thời gian</dt><dd>{s.durationMin} phút</dd></div>
              <div><dt>Bắt đầu</dt><dd>{fmtVnFull(s.startsAt)}</dd></div>
              <div><dt>Giám sát</dt><dd>{PRESET_LABEL[s.settings.integrity.preset]}</dd></div>
            </dl>
            {s.instructions && <div className="vec-instr"><b>Hướng dẫn của giảng viên</b><p>{s.instructions}</p></div>}
          </section>
          <section className="vec-card vec-lobby-action">
            {closed ? (
              <>
                <CircleAlert className="ic ic-lg" />
                <h2>Phòng thi đã đóng</h2>
                <p>Phiên thi này đã kết thúc.</p>
                <Link to="/app/vec" className="btn btn-primary">Về Phòng thi ảo</Link>
              </>
            ) : (
              <>
                <div className="vec-bigclock" aria-live="polite">
                  {live || retake ? <span className="is-go">Sẵn sàng</span> : left > 0 ? clockText(left) : s.status === 'PAUSED' ? 'Tạm dừng' : '00:00'}
                </div>
                <p className="vec-muted">
                  {retake ? 'Lượt làm lại bắt đầu ngay khi bạn bấm nút.' : live ? 'Đã đến giờ thi. Bấm nút bên dưới để bắt đầu.' : s.status === 'PAUSED' ? 'Giảng viên đang tạm dừng phòng thi.' : 'Giữ trang này mở. Nút bắt đầu sẽ sáng lên đúng giờ.'}
                </p>
                <ul className="vec-checks">
                  <li className={cn(desktopOk ? 'ok' : 'bad')}><MonitorSmartphone className="ic" /> {desktopOk ? 'Màn hình đủ rộng' : 'Cần máy tính để thi (màn hình quá nhỏ)'}</li>
                  <li className={cn(fsOk ? 'ok' : 'bad')}><Maximize className="ic" /> {fsOk ? 'Hỗ trợ toàn màn hình' : 'Trình duyệt này không hỗ trợ toàn màn hình'}</li>
                  <li className="ok"><Wifi className="ic" /> Kết nối ổn định</li>
                </ul>
                <Button size="lg" block loading={busy} disabled={(!live && !retake) || !desktopOk || !fsOk} onClick={start} icon={<Maximize className="ic" />}>
                  Bắt đầu làm bài
                </Button>
                {err && <p className="vec-err">{err}</p>}
                <p className="vec-fine">Bài thi chạy toàn màn hình. Thoát toàn màn hình, đổi tab hay tải lại trang có thể làm bài bị khóa tùy mức giám sát.</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── locked ───────────────────────────── */

function LockedScreen({ a, onChange }: { a: AttemptStateDto; onChange: () => void }) {
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useHeartbeat({
    attemptId: a.id,
    active: true,
    connectionId: sessionStorage.getItem(`vec:conn:${a.id}`),
    read: () => ({ fullscreen: !!document.fullscreenElement, visible: !document.hidden, focused: document.hasFocus(), current: 0, answered: a.answered }),
    onResponse: (r) => r.attemptState !== 'SUSPENDED' && onChange(),
  });
  const send = async () => {
    setBusy(true);
    try {
      await vec.request(a.id, 'UNLOCK', reason.trim());
      setSent(true);
    } catch (e) {
      toast.error('Chưa gửi được', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vec-room-page">
      <div className="vec-center">
        <div className="vec-note vec-locked">
          <span className="vec-lockic"><Lock className="ic ic-lg" /></span>
          <h2>Bài thi đang bị khóa</h2>
          <p className="vec-lockwhy">Lý do: <b>{a.lockReason ?? 'Hành vi không được phép'}</b></p>
          <p>Đáp án đã chọn vẫn được giữ nguyên. Chờ giảng viên mở khóa, bạn không cần tải lại trang.</p>
          {sent ? (
            <p className="vec-ok"><ShieldCheck className="ic" /> Đã gửi yêu cầu. Giữ trang này mở và chờ giảng viên.</p>
          ) : (
            <>
              <Field label="Nhắn cho giảng viên (không bắt buộc)">
                <textarea className="textarea" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: Em lỡ bấm phím Esc." />
              </Field>
              <Button onClick={send} loading={busy} icon={<Send className="ic" />}>Xin giảng viên mở khóa</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── exam ───────────────────────────── */

/** Attempts whose reload was already judged in this page load (module state dies with a real reload). */
const reloadCounted = new Set<string>();

function ExamView({ a, onChange }: { a: AttemptStateDto; onChange: () => void }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const s = a.session;
  const integ = s.settings.integrity;
  const now = useServerTick(500);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState('');
  const [paper, setPaper] = useState<PaperDto | null>(null);
  const [deadline, setDeadline] = useState<number>(a.deadlineAt ?? serverNow() + s.durationMin * 60_000);
  const [paused, setPaused] = useState(false);
  const [fs, setFs] = useState(!canFullscreen() || !!document.fullscreenElement);
  const [banner, setBanner] = useState<{ text: string; urgent: boolean } | null>(null);
  const [warnText, setWarnText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cur, setCur] = useState(0);
  const [mode, setMode] = useState<'LIST' | 'OMR'>(() => (localStorage.getItem('vec:sheet') as 'LIST' | 'OMR') || 'OMR');
  const [fontStep, setFontStep] = useState(() => Number(localStorage.getItem('vec:font')) || 0);
  const mountedAt = useRef(Date.now());
  const done = useRef(false);

  // One connection per attempt; a reload keeps its own id, a second tab is refused.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const stored = sessionStorage.getItem(`vec:conn:${a.id}`) ?? a.connectionId ?? undefined;
        const r = await vec.claim(a.id, stored ?? undefined);
        sessionStorage.setItem(`vec:conn:${a.id}`, r.connectionId);
        if (live) setConnectionId(r.connectionId);
        const p = await vec.paper(a.id);
        if (live) setPaper(p);
      } catch (e) {
        if (live) setClaimError((e as Error).message);
      }
    })();
    return () => { live = false; };
  }, [a.id, a.connectionId]);

  const initialAnswers = useMemo(() => paper?.answers ?? {}, [paper]);
  const autosave = useAutosave(a.id, initialAnswers, Boolean(paper), onChange);
  const { answers, set } = autosave;

  const guard = useExamGuard({
    attemptId: a.id,
    active: Boolean(paper) && !done.current,
    preset: integ.preset,
    blockCopy: integ.blockCopy,
    onWarn: (t) => setWarnText(t),
    onLocked: () => onChange(),
  });

  // A reload is a behaviour of its own: the page was in an exam before and loaded again.
  useEffect(() => {
    if (!paper) return;
    const key = `vec:seen:${a.id}`;
    const nav0 = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    // The browser keeps saying "reload" for the whole page life, and this screen remounts after a
    // lecturer unlocks it. Count a reload once per page load, or the unlock would lock again.
    if (!reloadCounted.has(a.id)) {
      reloadCounted.add(a.id);
      if (sessionStorage.getItem(key) && nav0?.type === 'reload') void guard.report('PAGE_RELOAD');
    }
    sessionStorage.setItem(key, '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.attemptId]);

  // Leaving the exam screen inside the app counts; StrictMode's instant remount does not.
  useEffect(() => {
    return () => {
      if (!done.current && Date.now() - mountedAt.current > 2000) void vec.violation(a.id, 'LEAVE_EXAM_VIEW').catch(() => undefined);
    };
  }, [a.id]);
  useEffect(() => {
    const warnClose = (e: BeforeUnloadEvent) => {
      if (done.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warnClose);
    return () => window.removeEventListener('beforeunload', warnClose);
  }, []);
  useEffect(() => {
    const onFs = () => setFs(!canFullscreen() || !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const finish = useCallback(
    async (auto: boolean) => {
      if (done.current) return;
      done.current = true;
      setSubmitting(true);
      try {
        await autosave.flush().catch(() => false);
        const rest = autosave.pendingItems();
        await vec.submit(a.id, rest.length ? rest : undefined);
        autosave.clear();
        sessionStorage.removeItem(`vec:seen:${a.id}`);
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
        await qc.invalidateQueries({ queryKey: vecKeys.attempt(a.id) });
        nav(`/app/vec/result/${a.id}`, { replace: true });
      } catch (e) {
        done.current = false;
        setSubmitting(false);
        const st = (e as { status?: number }).status;
        if (st === 409 || st === 423) onChange();
        else toast.error(auto ? 'Hết giờ nhưng chưa nộp được' : 'Chưa nộp được', `${(e as Error).message} Bài của bạn đã được lưu, thử lại nhé.`);
      }
    },
    [a.id, autosave, nav, onChange, qc, toast],
  );

  const hb = useHeartbeat({
    attemptId: a.id,
    active: Boolean(connectionId),
    connectionId,
    read: () => ({ fullscreen: !!document.fullscreenElement, visible: !document.hidden, focused: document.hasFocus(), current: cur, answered: Object.values(answers).filter((x) => x.oids.length).length }),
    onResponse: (r: HeartbeatResponse) => {
      if (r.deadlineAt) setDeadline(r.deadlineAt);
      setPaused(r.sessionStatus === 'PAUSED');
      for (const c of r.commands) {
        if (c.type === 'MESSAGE') {
          setBanner({ text: c.body, urgent: c.urgent });
          if (!c.urgent) setTimeout(() => setBanner((b) => (b?.text === c.body ? null : b)), 12_000);
        }
        if (c.type === 'RELEASE_DEVICE') setClaimError('Bài thi đã được mở ở một tab hoặc thiết bị khác.');
      }
      if (r.attemptState !== 'IN_PROGRESS') {
        done.current = true;
        onChange();
      }
    },
  });

  const remaining = deadline - now;
  useEffect(() => {
    if (paper && !paused && remaining <= 0 && !done.current) void finish(true);
  }, [remaining, paper, paused, finish]);

  const questions = paper?.questions ?? [];
  const total = questions.length;
  const q = questions[cur];
  const answered = questions.filter((x) => (answers[x.qid]?.oids.length ?? 0) > 0).length;
  const flagged = questions.filter((x) => answers[x.qid]?.flagged).length;

  const choose = useCallback(
    (oid: string) => {
      if (!q) return;
      const prev = answers[q.qid]?.oids ?? [];
      const next = q.kind === 'MULTI' ? (prev.includes(oid) ? prev.filter((x) => x !== oid) : [...prev, oid]) : prev[0] === oid ? [] : [oid];
      set(q.qid, next);
    },
    [q, answers, set],
  );

  // A–H and 1–8 pick an option, arrows move, F flags. Nothing fires while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.('input,textarea,[role="dialog"]')) return;
      if (e.key === 'ArrowRight') setCur((c) => Math.min(total - 1, c + 1));
      else if (e.key === 'ArrowLeft') setCur((c) => Math.max(0, c - 1));
      else if (e.key.toLowerCase() === 'f' && q) set(q.qid, answers[q.qid]?.oids ?? [], !answers[q.qid]?.flagged);
      else {
        const idx = LETTERS.indexOf(e.key.toUpperCase());
        const n = idx >= 0 && e.key.length === 1 && /[a-h]/i.test(e.key) ? idx : /^[1-8]$/.test(e.key) ? Number(e.key) - 1 : -1;
        const opt = q?.options[n];
        if (opt) choose(opt.oid);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, total, answers, set, choose]);

  const fontClass = ['vec-fs-0', 'vec-fs-1', 'vec-fs-2'][fontStep + 1] ?? 'vec-fs-1';
  const setFont = (d: number) => {
    const v = Math.max(-1, Math.min(1, fontStep + d));
    setFontStep(v);
    localStorage.setItem('vec:font', String(v));
  };
  const setSheet = (m: 'LIST' | 'OMR') => {
    setMode(m);
    localStorage.setItem('vec:sheet', m);
  };

  if (claimError) {
    return (
      <div className="vec-room-page">
        <div className="vec-center">
          <div className="vec-note">
            <MonitorSmartphone className="ic ic-lg" />
            <h2>Không vào được bài thi ở đây</h2>
            <p>{claimError}</p>
            <div className="vec-row">
              <Button onClick={() => window.location.reload()}>Thử lại</Button>
              <Link to="/app/vec" className="btn btn-secondary">Về Phòng thi ảo</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!paper || !q) return <div className="vec-room-page"><div className="vec-center"><Skeleton style={{ height: 300, width: 'min(720px, 92vw)' }} /></div></div>;

  const danger = remaining < 60_000 ? 'is-danger' : remaining < 5 * 60_000 ? 'is-warn' : '';
  const timeLeftPct = Math.max(0, Math.min(1, remaining / Math.max(1, s.durationMin * 60_000)));
  const donePct = total ? Math.round((answered / total) * 100) : 0;
  const initials = a.candidate.fullName.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?';
  const mark = answers[q.qid];
  const watermark = integ.watermark ? `${a.candidate.fullName} · ${a.candidate.studentCode || user?.email || ''}` : '';

  return (
    <div className={cn('vec-exam', fontClass)} data-protected>
      {watermark && <div className="vec-wm" aria-hidden style={{ ['--wm' as string]: `"${watermark.replace(/"/g, '')}"` }}>{Array.from({ length: 24 }, (_, i) => <span key={i}>{watermark}</span>)}</div>}
      <header className="vec-xtop">
        <div className="vec-xtitle">
          <b>{s.title}</b>
          <span>{s.subjectCode} · Mã đề <b className="vec-code">{a.paperCode}</b> · Lượt {a.attemptNo}/{a.maxAttempts}</span>
        </div>
        <div className="vec-xmid" aria-label={`Đã làm ${answered} trên ${total} câu`}>
          <div className="vec-xmid-row"><span>Tiến độ làm bài</span><b>{answered}/{total} câu · {donePct}%</b></div>
          <div className="vec-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}><i style={{ width: `${donePct}%` }} /></div>
        </div>
        <div className="vec-xright">
          <span className={cn('vec-save', `is-${autosave.status}`)} role="status">
            {autosave.status === 'saved' ? <><ShieldCheck className="ic ic-sm" /> Đã lưu</> : autosave.status === 'saving' ? <>Đang lưu…</> : <><WifiOff className="ic ic-sm" /> Chưa lưu được, sẽ thử lại</>}
          </span>
          {!hb.online && <span className="vec-save is-offline"><WifiOff className="ic ic-sm" /> Mất kết nối</span>}
          <span className={cn('vec-timer', danger)} style={{ ['--p' as string]: `${(timeLeftPct * 360).toFixed(1)}deg` }} role="timer" aria-label="Thời gian còn lại">
            <span className="vec-timer-in"><Clock className="ic" /> {clockText(remaining)}</span>
          </span>
          <Button variant="primary" onClick={() => setConfirm(true)} icon={<Send className="ic" />}>Nộp bài</Button>
        </div>
      </header>

      {banner && (
        <div className={cn('vec-banner', banner.urgent && 'is-urgent')} role="alert">
          <Megaphone className="ic" /> <span>Giảng viên: {banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Đóng">×</button>
        </div>
      )}
      {warnText && (
        <div className="vec-banner is-warn" role="alert">
          <CircleAlert className="ic" /> <span>{warnText}</span>
          <button type="button" onClick={() => setWarnText('')} aria-label="Đóng">×</button>
        </div>
      )}

      <div className="vec-xbody">
        <main className="vec-xmain">
          <article className="vec-qcard">
            <div className="vec-qhead">
              <span className="vec-qnum">Câu {cur + 1}<small>/{total}</small></span>
              <span className="vec-qkind">{q.kind === 'MULTI' ? 'Chọn tất cả đáp án đúng' : 'Chọn một đáp án'}</span>
              <button type="button" className={cn('vec-flag', mark?.flagged && 'is-on')} onClick={() => set(q.qid, mark?.oids ?? [], !mark?.flagged)} aria-pressed={!!mark?.flagged}>
                <Flag className="ic ic-sm" /> {mark?.flagged ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}
              </button>
            </div>
            <QText text={q.text} />
            <ul className="vec-opts" role={q.kind === 'MULTI' ? 'group' : 'radiogroup'}>
              {q.options.map((o, i) => {
                const on = mark?.oids.includes(o.oid) ?? false;
                return (
                  <li key={o.oid}>
                    <button type="button" role={q.kind === 'MULTI' ? 'checkbox' : 'radio'} aria-checked={on} className={cn('vec-opt', on && 'is-on', q.kind === 'MULTI' && 'is-multi')} onClick={() => choose(o.oid)}>
                      <span className="vec-mark" aria-hidden>{on ? '✓' : ''}</span>
                      <span className="vec-letter">{LETTERS[i]}</span>
                      <span className="vec-otext"><Inline text={o.text} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="vec-qfoot">
              <Button variant="secondary" onClick={() => setCur(Math.max(0, cur - 1))} disabled={cur === 0} icon={<ArrowLeft className="ic" />}>Câu trước</Button>
              <span className="vec-keys">Phím A–D chọn · ← → chuyển câu · F đánh dấu</span>
              <Button onClick={() => setCur(Math.min(total - 1, cur + 1))} disabled={cur === total - 1} iconEnd={<ArrowRight className="ic" />}>Câu sau</Button>
            </div>
          </article>

        </main>

        <aside className="vec-sheet-wrap">
          <div className="vec-who">
            <span className="vec-avatar">{initials}</span>
            <div className="vec-who-main">
              <b>{a.candidate.fullName}</b>
              <small>{a.candidate.studentCode || a.candidate.email}{a.candidate.className ? ` · ${a.candidate.className}` : ''}</small>
            </div>
            <dl className="vec-who-meta">
              <div><dt>Mã đề</dt><dd><b className="vec-code">{a.paperCode}</b></dd></div>
              <div><dt>Lượt thi</dt><dd>{a.attemptNo}/{a.maxAttempts}</dd></div>
              <div><dt>Môn</dt><dd>{s.subjectCode}</dd></div>
              {a.candidate.term && <div><dt>Học kỳ</dt><dd>{a.candidate.term.replace('_', ' · ')}</dd></div>}
            </dl>
            <div className="vec-tools">
              <span>Cỡ chữ</span>
              <button type="button" onClick={() => setFont(-1)} disabled={fontStep <= -1} aria-label="Giảm cỡ chữ">A−</button>
              <button type="button" onClick={() => setFontStep(0)} aria-label="Cỡ chữ mặc định">A</button>
              <button type="button" onClick={() => setFont(1)} disabled={fontStep >= 1} aria-label="Tăng cỡ chữ">A+</button>
            </div>
          </div>
          <div className="vec-sheet-card">
            <div className="vec-sheet-head">
              <b>Phiếu trả lời</b>
              <div className="vec-seg" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'OMR'} className={cn(mode === 'OMR' && 'is-on')} onClick={() => setSheet('OMR')}>Phiếu tô</button>
                <button type="button" role="tab" aria-selected={mode === 'LIST'} className={cn(mode === 'LIST' && 'is-on')} onClick={() => setSheet('LIST')}>Danh sách</button>
              </div>
            </div>
            <div className="vec-sheet-stats">
              <span><i className="dot-ans" /> Đã làm {answered}</span>
              <span><i className="dot-todo" /> Chưa làm {total - answered}</span>
              <span><i className="dot-flag" /> Đánh dấu {flagged}</span>
            </div>
            {mode === 'LIST' ? (
              <div className="vec-grid">
                {questions.map((x, i) => (
                  <button key={x.qid} type="button" className={cn('vec-gq', (answers[x.qid]?.oids.length ?? 0) > 0 && 'is-ans', answers[x.qid]?.flagged && 'is-flag', i === cur && 'is-cur')} onClick={() => setCur(i)}>
                    {i + 1}
                  </button>
                ))}
              </div>
            ) : (
              <OmrSheet questions={questions} answers={answers} cur={cur} onGo={setCur} onPick={(qi, oid) => {
                const qq = questions[qi]!;
                const prev = answers[qq.qid]?.oids ?? [];
                set(qq.qid, qq.kind === 'MULTI' ? (prev.includes(oid) ? prev.filter((x) => x !== oid) : [...prev, oid]) : prev[0] === oid ? [] : [oid]);
                setCur(qi);
              }} />
            )}
            <Button block variant="primary" onClick={() => setConfirm(true)} icon={<Send className="ic" />}>Nộp bài</Button>
          </div>
        </aside>
      </div>

      {!fs && (
        <div className="vec-overlay" role="alertdialog" aria-modal>
          <div className="vec-note">
            <Maximize className="ic ic-lg" />
            <h2>Vào lại chế độ toàn màn hình</h2>
            <p>Bài thi chỉ hiển thị khi toàn màn hình. Thời gian vẫn đang chạy.</p>
            <Button size="lg" onClick={() => void enterFullscreen()}>Vào toàn màn hình</Button>
          </div>
        </div>
      )}
      {paused && (
        <div className="vec-overlay" role="alertdialog" aria-modal>
          <div className="vec-note">
            <PauseCircle className="ic ic-lg" />
            <h2>Giảng viên đang tạm dừng phòng thi</h2>
            <p>Đồng hồ của bạn cũng dừng. Giữ trang này mở, bài sẽ tiếp tục khi giảng viên mở lại.</p>
          </div>
        </div>
      )}
      {banner?.urgent && (
        <Modal open onClose={() => setBanner(null)} title="Thông báo khẩn từ giảng viên" size="sm" footer={<Button onClick={() => setBanner(null)}>Đã hiểu</Button>}>
          <p style={{ fontSize: 16 }}>{banner.text}</p>
        </Modal>
      )}
      <Modal
        open={confirm}
        onClose={() => !submitting && setConfirm(false)}
        title="Nộp bài?"
        description={remaining > 0 ? 'Sau khi nộp bạn không sửa được bài này nữa.' : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={submitting}>Làm tiếp</Button>
            <Button onClick={() => void finish(false)} loading={submitting} icon={<Send className="ic" />}>Nộp bài</Button>
          </>
        }
      >
        <ul className="vec-sum">
          <li><b>{answered}</b> câu đã làm</li>
          <li className={cn(total - answered > 0 && 'is-warn')}><b>{total - answered}</b> câu chưa làm</li>
          {flagged > 0 && <li className="is-warn"><b>{flagged}</b> câu đang đánh dấu xem lại</li>}
          <li><AlarmClock className="ic ic-sm" /> Còn {clockText(remaining)}</li>
        </ul>
      </Modal>
    </div>
  );
}

type PQ = PaperDto['questions'][number];

/** Bubble answer sheet: blocks of 5 rows, 25 questions down a column, then the next column. */
function OmrSheet({ questions, answers, cur, onGo, onPick }: { questions: PQ[]; answers: Record<string, { oids: string[]; flagged: boolean }>; cur: number; onGo: (i: number) => void; onPick: (qi: number, oid: string) => void }) {
  const PER_COL = 25;
  const PER_PAGE = PER_COL * 2;
  const pages = Math.max(1, Math.ceil(questions.length / PER_PAGE));
  const [page, setPage] = useState(0);
  useEffect(() => setPage(Math.min(pages - 1, Math.floor(cur / PER_PAGE))), [cur, pages]);
  const slice = questions.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const cols = useMemo(() => [slice.slice(0, PER_COL), slice.slice(PER_COL)], [slice]);
  return (
    <div className="vec-omr">
      <div className="vec-omr-cols">
        {cols.map((col, ci) => (
          <div key={ci} className="vec-omr-col">
            {Array.from({ length: Math.ceil(col.length / 5) }, (_, bi) => (
              <div key={bi} className="vec-omr-block">
                {col.slice(bi * 5, bi * 5 + 5).map((x, ri) => {
                  const qi = page * PER_PAGE + ci * PER_COL + bi * 5 + ri;
                  const a = answers[x.qid];
                  return (
                    <div key={x.qid} className={cn('vec-omr-row', qi === cur && 'is-cur', a?.flagged && 'is-flag')}>
                      <button type="button" className="vec-omr-n" onClick={() => onGo(qi)} aria-label={`Tới câu ${qi + 1}`}>{qi + 1}</button>
                      {x.options.map((o, oi) => (
                        <button key={o.oid} type="button" aria-label={`Câu ${qi + 1} đáp án ${LETTERS[oi]}`} aria-pressed={a?.oids.includes(o.oid)} className={cn('vec-bub', x.kind === 'MULTI' && 'is-multi', a?.oids.includes(o.oid) && 'is-on')} onClick={() => onPick(qi, o.oid)}>
                          {LETTERS[oi]}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="vec-omr-pages">
          <button type="button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>‹</button>
          <span>Trang {page + 1}/{pages}</span>
          <button type="button" onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={page === pages - 1}>›</button>
        </div>
      )}
      <p className="vec-omr-legend"><span className="vec-bub is-demo">●</span> chọn một <span className="vec-bub is-multi is-demo">■</span> chọn nhiều</p>
    </div>
  );
}

export { formatRoomCode };
