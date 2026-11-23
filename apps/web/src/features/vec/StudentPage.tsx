import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, CalendarClock, CircleAlert, Clock, KeyRound, Loader2, RefreshCw, ScrollText, Timer, UserRound } from 'lucide-react';
import { fmtDuration, fmtVnDate, fmtVnTime, formatRoomCode, parseRoomCode, PRESET_LABEL, type CandidateInfo, type JoinLookup, type JoinSessionDto } from '@kaned/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { PageHead } from '@/components/ui/Panel';
import { Modal } from '@/components/ui/Modal';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { vec, vecKeys } from './api';
import { OtpBoxes } from './Otp';
import { useServerTick } from './hooks';
import './vec.css';

type Step = 'CODE' | 'OTP' | 'INFO';
type Terminal = Exclude<JoinLookup, { state: 'OK' } | { state: 'NEEDS_OTP' }>;

export default function StudentPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>('CODE');
  const [code, setCode] = useState(formatRoomCode(parseRoomCode(params.get('code') ?? '')));
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState('');
  const [session, setSession] = useState<JoinSessionDto | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [info, setInfo] = useState<CandidateInfo | null>(null);
  const [consent, setConsent] = useState(false);
  const [rules, setRules] = useState(false);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const codeRef = useRef<HTMLInputElement>(null);
  const prefill = useQuery({ queryKey: vecKeys.prefill, queryFn: vec.prefill, staleTime: 5 * 60_000 });

  useEffect(() => {
    if (prefill.data && !info) setInfo(prefill.data.info);
  }, [prefill.data, info]);
  useEffect(() => codeRef.current?.focus(), []);

  const apply = (r: JoinLookup) => {
    setErr('');
    if (r.state === 'OK') {
      setTicket(r.ticket);
      setSession(r.session);
      setStep('INFO');
    } else if (r.state === 'NEEDS_OTP') setStep('OTP');
    else setTerminal(r);
  };
  const run = async (fn: () => Promise<JoinLookup>) => {
    setBusy(true);
    setErr('');
    try {
      apply(await fn());
    } catch (e) {
      setErr(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };
  const digits = parseRoomCode(code);

  const enter = async () => {
    if (!info || !session) return;
    const f: Record<string, string> = {};
    if (info.fullName.trim().length < 2) f.fullName = 'Nhập họ và tên.';
    if (!/^\S+@\S+\.\S+$/.test(info.email)) f.email = 'Email chưa hợp lệ.';
    if (session.settings.access.requireStudentCode && !info.studentCode.trim()) f.studentCode = 'Nhập mã số sinh viên.';
    setFieldErr(f);
    if (Object.keys(f).length) return;
    if (!consent) return setErr('Hãy đồng ý với quy chế thi để tiếp tục.');
    setBusy(true);
    setErr('');
    try {
      const r = await vec.enter(ticket, info, true);
      nav(`/app/vec/room/${r.attemptId}`);
    } catch (e) {
      const x = toApiError(e);
      setErr(x.message);
      if (x.fields) setFieldErr(x.fields);
      if (x.code === 'TICKET_EXPIRED') setStep('CODE');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setTerminal(null);
    setStep('CODE');
    setSession(null);
    setOtp('');
    setErr('');
  };

  return (
    <>
      <PageHead crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Vào phòng thi' }]} title="Vào phòng thi" description="Nhập mã phòng 7 chữ số do giảng viên cung cấp." />
      <div className="container vec-body">
        <ol className="vec-steps" aria-label="Các bước">
          {(['Mã phòng', 'Mã OTP', 'Thông tin'] as const).map((t, i) => {
            const idx = ['CODE', 'OTP', 'INFO'].indexOf(step);
            const skipOtp = i === 1 && step === 'INFO' && !session?.settings.access.otp;
            return (
              <li key={t} className={cn(i === idx && 'is-cur', i < idx && 'is-done', skipOtp && 'is-skip')}>
                <span>{i < idx ? '✓' : i + 1}</span> {t}
              </li>
            );
          })}
        </ol>

        {terminal ? (
          <TerminalCard t={terminal} onBack={reset} onRetry={() => { setTerminal(null); void run(() => (otp ? vec.otp(digits, otp) : vec.lookup(digits))); }} busy={busy} />
        ) : step === 'CODE' ? (
          <form className="vec-join-card" onSubmit={(e) => { e.preventDefault(); if (digits.length === 7) void run(() => vec.lookup(digits)); }}>
            <label htmlFor="vec-code" className="vec-join-label">Mã phòng thi</label>
            <input
              id="vec-code"
              ref={codeRef}
              className={cn('vec-codeinput', err && 'is-bad')}
              inputMode="numeric"
              autoComplete="off"
              placeholder="000 0000"
              value={code}
              maxLength={8}
              onChange={(e) => setCode(formatRoomCode(parseRoomCode(e.target.value)))}
              aria-invalid={!!err}
            />
            {err && <p className="vec-err" role="alert"><CircleAlert className="ic ic-sm" /> {err}</p>}
            <Button type="submit" size="lg" block loading={busy} disabled={digits.length !== 7} iconEnd={<ArrowRight className="ic" />}>Tiếp tục</Button>
            <p className="vec-fine">Mã gồm 7 chữ số, chữ số đầu từ 1 đến 9. Nhập sai nhiều lần sẽ bị khóa vài phút.</p>
          </form>
        ) : step === 'OTP' ? (
          <form className="vec-join-card" onSubmit={(e) => { e.preventDefault(); void run(() => vec.otp(digits, otp)); }}>
            <label className="vec-join-label"><KeyRound className="ic" /> Mã OTP của phòng</label>
            <OtpBoxes value={otp} onChange={(v) => { setOtp(v); if (err) setErr(''); }} onComplete={(v) => void run(() => vec.otp(digits, v))} invalid={!!err} disabled={busy} autoFocus />
            {err && <p className="vec-err" role="alert"><CircleAlert className="ic ic-sm" /> {err}</p>}
            <div className="vec-row">
              <Button variant="secondary" onClick={reset}>Đổi mã phòng</Button>
              <Button type="submit" loading={busy} disabled={otp.length < 6} iconEnd={<ArrowRight className="ic" />}>Xác nhận</Button>
            </div>
            <p className="vec-fine">Nhập 6 chữ số, hoặc dán cả mã. Phòng này có thêm mã OTP, xin mã từ giảng viên ngay trong phòng thi.</p>
          </form>
        ) : session && info ? (
          <div className="vec-info-grid">
            <section className="vec-card">
              <h2>Xác nhận thông tin thí sinh</h2>
              <p className="vec-muted">Thông tin này in trên thẻ dự thi và bảng điểm của giảng viên.</p>
              <div className="vec-form2">
                <Field label="Họ và tên" required error={fieldErr.fullName}><Input value={info.fullName} onChange={(e) => setInfo({ ...info, fullName: e.target.value })} maxLength={80} /></Field>
                <Field label="Email" required error={fieldErr.email}><Input value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} /></Field>
                <Field label="Mã số sinh viên" required={session.settings.access.requireStudentCode} error={fieldErr.studentCode}><Input value={info.studentCode} onChange={(e) => setInfo({ ...info, studentCode: e.target.value.toUpperCase() })} maxLength={20} placeholder="SE123456" /></Field>
                <Field label="Lớp"><Input value={info.className} onChange={(e) => setInfo({ ...info, className: e.target.value })} maxLength={40} placeholder="SE1801" /></Field>
                <Field label="Trường">
                  <select className="select" value={info.universityId} onChange={(e) => setInfo({ ...info, universityId: e.target.value, universityName: prefill.data?.universities.find((u) => u.id === e.target.value)?.name ?? '' })}>
                    <option value="">Chọn trường</option>
                    {prefill.data?.universities.map((u) => <option key={u.id} value={u.id}>{u.short} – {u.name}</option>)}
                  </select>
                </Field>
                <TermPicker value={info.term} universityId={info.universityId} universityCode={prefill.data?.universities.find((u) => u.id === info.universityId)?.short ?? ''} terms={prefill.data?.terms ?? []} onChange={(term) => setInfo({ ...info, term })} />
              </div>
              <label className="vec-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>Tôi đã đọc và đồng ý với <button type="button" className="vec-link" onClick={() => setRules(true)}>quy chế phòng thi</button>.</span>
              </label>
              {err && <p className="vec-err" role="alert"><CircleAlert className="ic ic-sm" /> {err}</p>}
              <div className="vec-row">
                <Button variant="secondary" onClick={reset}>Quay lại</Button>
                <Button size="lg" loading={busy} onClick={enter} iconEnd={<ArrowRight className="ic" />}>Vào phòng chờ</Button>
              </div>
            </section>
            <AdmitCard s={session} info={info} />
          </div>
        ) : (
          <div className="vec-center"><Loader2 className="ic spin" /></div>
        )}
      </div>
      <Modal open={rules} onClose={() => setRules(false)} title="Quy chế phòng thi" size="md" footer={<Button onClick={() => { setConsent(true); setRules(false); }}>Tôi đồng ý</Button>}>
        <ul className="vec-rules">
          <li>Chỉ làm bài bằng tài khoản của chính bạn, trên một thiết bị và một tab.</li>
          <li>Bài thi chạy toàn màn hình. {session ? `Mức giám sát: ${PRESET_LABEL[session.settings.integrity.preset]}.` : ''} Thoát toàn màn hình, đổi tab, tải lại trang có thể khiến bài bị khóa.</li>
          <li>Không sao chép, chụp, chia sẻ nội dung đề. Mọi hành vi được ghi lại cho giảng viên.</li>
          <li>Đáp án được lưu tự động. Hết giờ, hệ thống tự nộp bài.</li>
          <li>Kết quả hiển thị theo thiết lập của giảng viên.</li>
        </ul>
      </Modal>
    </>
  );
}

function TerminalCard({ t, onBack, onRetry, busy }: { t: Terminal; onBack: () => void; onRetry: () => void; busy: boolean }) {
  const nav = useNavigate();
  let icon = <CircleAlert className="ic ic-lg" />;
  let title = '';
  let body: React.ReactNode = '';
  let actions: React.ReactNode = <Button onClick={onBack}>Nhập mã khác</Button>;
  if (t.state === 'HOST') {
    title = 'Đây là phiên do bạn tổ chức';
    body = 'Giảng viên không vào phòng với vai trò thí sinh. Mở trang quản lý để theo dõi phiên.';
    actions = <Link to="/app/vec/lecturer" className="btn btn-primary">Quản lý phiên thi</Link>;
  } else if (t.state === 'NOT_OPEN') {
    icon = <CalendarClock className="ic ic-lg" />;
    title = 'Phòng thi chưa mở';
    body = <>Phòng chờ của “{t.title}” sẽ mở lúc <b>{fmtVnTime(t.opensAt)}, {fmtVnDate(t.opensAt)}</b>. Giữ trang này, hoặc quay lại sau thời điểm đó.</>;
    actions = <Button onClick={onRetry} loading={busy} icon={<RefreshCw className="ic" />}>Kiểm tra lại</Button>;
  } else if (t.state === 'CLOSED') {
    title = 'Phòng thi đã đóng';
    body = 'Phiên thi này đã kết thúc hoặc đã quá thời gian vào phòng muộn. Liên hệ giảng viên nếu bạn cần hỗ trợ.';
  } else if (t.state === 'ALREADY_ACTIVE') {
    icon = <BadgeCheck className="ic ic-lg" />;
    title = 'Bạn đang trong phòng thi này';
    body = <>“{t.title}” vẫn còn mở với bạn. Vào lại để tiếp tục, đáp án đã chọn được giữ nguyên.</>;
    actions = <Button onClick={() => nav(`/app/vec/room/${t.attemptId}`)}>Vào lại phòng thi</Button>;
  } else if (t.state === 'ALREADY_SUBMITTED') {
    icon = <BadgeCheck className="ic ic-lg" />;
    title = 'Bạn đã có bài trong phòng này';
    body = <>“{t.title}”. {t.canRetake ? 'Bạn còn lượt làm lại.' : 'Xem kết quả bên dưới.'}</>;
    actions = <Button onClick={() => nav(`/app/vec/result/${t.attemptId}`)}>{t.canRetake ? 'Xem kết quả và làm lại' : 'Xem kết quả'}</Button>;
  }
  return (
    <div className="vec-note vec-note-inline">
      {icon}
      <h2>{title}</h2>
      <p>{body}</p>
      {t.state === 'NOT_OPEN' && <OpenCountdown t={t} />}
      <div className="vec-row">
        {actions}
        {(t.state === 'HOST' || t.state === 'CLOSED') ? null : <Button variant="secondary" onClick={onBack}>Nhập mã khác</Button>}
      </div>
    </div>
  );
}

function OpenCountdown({ t }: { t: Extract<Terminal, { state: 'NOT_OPEN' }> }) {
  const now = useServerTick(1000);
  const left = Math.max(0, t.opensAt - now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const sec = Math.floor((left % 60_000) / 1000);
  const days = Math.floor(h / 24);
  return (
    <div className="vec-open">
      <div className="vec-open-clock" role="timer" aria-label="Thời gian đến khi phòng chờ mở">
        {days > 0 ? <><b>{days}</b><small>ngày</small></> : null}
        <b>{String(h % 24).padStart(2, '0')}</b><small>giờ</small>
        <b>{String(m).padStart(2, '0')}</b><small>phút</small>
        <b>{String(sec).padStart(2, '0')}</b><small>giây</small>
      </div>
      <dl className="vec-dl vec-dl-tight">
        <div><dt>Môn</dt><dd>{t.subjectCode} · {t.subjectName}</dd></div>
        <div><dt>Giảng viên</dt><dd>{t.lecturerDisplay}</dd></div>
        <div><dt>Giờ thi</dt><dd>{fmtVnTime(t.startsAt)}, {fmtVnDate(t.startsAt)}</dd></div>
        <div><dt>Thời gian làm bài</dt><dd>{fmtDuration(t.durationMin * 60)}</dd></div>
        <div><dt>Số câu</dt><dd>{t.questionCount} câu</dd></div>
      </dl>
    </div>
  );
}

const BLOCKS = [
  { v: 'B10', label: 'Block 10 tuần' },
  { v: 'B5', label: 'Block 5 tuần' },
  { v: '', label: 'Không theo block' },
];

/** FPTU style: a term code (FA26) plus the block it runs in, stored as FA26_B10. */
function TermPicker({ value, universityId, universityCode, terms, onChange }: { value: string; universityId: string; universityCode: string; terms: Array<{ universityId: string; code: string; name: string; current: boolean }>; onChange: (v: string) => void }) {
  const [code, block] = value.split('_') as [string, string | undefined];
  const mine = terms.filter((t) => t.universityId === universityId);
  const list = mine.length ? mine : terms.filter((t, i, a) => a.findIndex((x) => x.code === t.code) === i);
  const blocky = /^(FA|SP|SU)\d\d$/.test(code || '') || universityCode.toUpperCase().startsWith('FPT');
  const known = list.some((t) => t.code === code);
  const setCode = (c: string) => onChange(blocky && block ? `${c}_${block}` : c);
  return (
    <>
      <Field label="Học kỳ">
        <select className="select" value={code} onChange={(e) => setCode(e.target.value)}>
          {!code && <option value="">Chọn học kỳ</option>}
          {!known && code && <option value={code}>{code}</option>}
          {list.map((t) => <option key={`${t.universityId}-${t.code}`} value={t.code}>{t.code} · {t.name}{t.current ? ' (hiện tại)' : ''}</option>)}
        </select>
      </Field>
      {blocky && (
        <Field label="Block">
          <select className="select" value={block ?? ''} onChange={(e) => onChange(e.target.value ? `${code}_${e.target.value}` : code)}>
            {BLOCKS.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}
          </select>
        </Field>
      )}
    </>
  );
}

export function AdmitCard({ s, info }: { s: JoinSessionDto; info: CandidateInfo }) {
  const initials = useMemo(() => info.fullName.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?', [info.fullName]);
  return (
    <aside className="vec-admit" aria-label="Thẻ dự thi">
      <div className="vec-admit-top" style={{ ['--uni' as string]: s.universityColor ?? '#4433B4' }}>
        <ScrollText className="ic" />
        <span>THẺ DỰ THI</span>
        <b>{formatRoomCode(s.roomCode)}</b>
      </div>
      <div className="vec-admit-who">
        <span className="vec-avatar">{initials}</span>
        <div>
          <b>{info.fullName || 'Họ và tên'}</b>
          <small>{info.studentCode || 'Mã sinh viên'}{info.className ? ` · ${info.className}` : ''}</small>
        </div>
      </div>
      <h3>{s.title}</h3>
      <p className="vec-muted">{s.subjectCode} · {s.subjectName}</p>
      <dl className="vec-dl vec-dl-tight">
        <div><dt><UserRound className="ic ic-sm" /> Giảng viên</dt><dd>{s.lecturerDisplay}</dd></div>
        <div><dt><CalendarClock className="ic ic-sm" /> Bắt đầu</dt><dd>{fmtVnTime(s.startsAt)}, {fmtVnDate(s.startsAt)}</dd></div>
        <div><dt><Timer className="ic ic-sm" /> Thời gian</dt><dd>{fmtDuration(s.durationMin * 60)}</dd></div>
        <div><dt><Clock className="ic ic-sm" /> Số câu</dt><dd>{s.questionCount} câu</dd></div>
      </dl>
      <div className="vec-admit-foot">
        <span>Giám sát: {PRESET_LABEL[s.settings.integrity.preset]}</span>
        {s.settings.retake.max > 0 && <span>Được làm lại tối đa {s.settings.retake.max} lần</span>}
      </div>
    </aside>
  );
}
