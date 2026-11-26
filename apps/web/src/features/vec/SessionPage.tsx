import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClockPlus, Ban, Check, CircleAlert, Copy, Download, Eye, EyeOff, Flag, Lock, LockOpen, Megaphone, MoreHorizontal, PauseCircle, PlayCircle, Radio, RotateCcw, Search, Send, Trash2, UserMinus, Users,
} from 'lucide-react';
import {
  PRESET_LABEL, RETAKE_SCORING_LABEL, RISK_LABEL, clockText, fmtBytes, fmtVnDate, fmtVnFull, fmtVnTime, foldVi, formatRoomCode, gradeLabel, riskLevel, vnToIso, vnToMs, vnParts,
  type MonitorDto, type MonitorEvent, type MonitorRow, type VecSessionDto,
} from '@kaned/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuButton, MenuSeparator } from '@/components/ui/Dropdown';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHead } from '@/components/ui/Panel';
import { http, toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import { syncClock, useServerTick, serverNow } from './hooks';
import { csvUrl, vec, vecKeys } from './api';
import { STATUS } from './HubPage';
import { PeGrading } from './pe/PeGrading';
import './vec.css';

type Dialog =
  | { k: 'resume'; row: MonitorRow }
  | { k: 'redo'; row: MonitorRow }
  | { k: 'remove'; row: MonitorRow }
  | { k: 'force'; row: MonitorRow }
  | { k: 'extend'; row?: MonitorRow }
  | { k: 'announce'; row?: MonitorRow }
  | { k: 'end' | 'cancel' | 'delete' | 'postpone' | 'release' }
  | null;

const STATE_LABEL: Record<string, string> = {
  LOBBY: 'Phòng chờ', IN_PROGRESS: 'Đang làm', SUSPENDED: 'Bị khóa', SUBMITTED: 'Đã nộp', AUTO_SUBMITTED: 'Tự nộp', FORCE_SUBMITTED: 'Bị thu bài', VOIDED: 'Đã hủy',
};
const stateTone = (s: string) => (s === 'IN_PROGRESS' ? 'green' : s === 'SUSPENDED' ? 'red' : s === 'LOBBY' ? 'amber' : s === 'VOIDED' ? 'gray' : 'blue');

export default function SessionPage({ tab }: { tab: 'monitor' | 'results' }) {
  const { sessionId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const now = useServerTick(1000);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showOtp, setShowOtp] = useState(false);
  const [copied, setCopied] = useState('');
  const cursor = useRef(0);
  const [events, setEvents] = useState<MonitorEvent[]>([]);

  const mon = useQuery({
    queryKey: ['vec', 'monitor', sessionId],
    queryFn: async (): Promise<MonitorDto> => {
      const sent = Date.now();
      const r = await vec.monitor(sessionId, cursor.current);
      syncClock(r.serverNow, sent, Date.now());
      return r;
    },
    refetchInterval: tab === 'monitor' ? 3000 : 15_000,
    staleTime: 0,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const d = mon.data;
    if (!d) return;
    if (d.events.length) setEvents((prev) => [...prev, ...d.events.filter((e) => !prev.some((p) => p.id === e.id))].slice(-300));
    cursor.current = Math.max(cursor.current, d.cursor);
  }, [mon.data]);

  const s = mon.data?.session;
  const act = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      await qc.invalidateQueries({ queryKey: ['vec', 'monitor', sessionId] });
      void qc.invalidateQueries({ queryKey: vecKeys.hosted });
      setDialog(null);
    } catch (e) {
      toast.error(label, toApiError(e).message);
    }
  };
  const copy = async (k: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(k);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      toast.error('Không sao chép được');
    }
  };

  if (mon.isLoading) return <div className="container vec-body"><Skeleton style={{ height: 320, marginTop: 26 }} /></div>;
  if (mon.isError || !s) return <div className="container vec-body"><ErrorState description={(mon.error as Error | null)?.message} onRetry={() => mon.refetch()} /></div>;
  const live = s.status === 'LIVE' || s.status === 'PAUSED';
  const open = live || s.status === 'LOBBY' || s.status === 'SCHEDULED';
  const closed = s.status === 'ENDED' || s.status === 'CANCELLED';

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Giảng viên', to: '/app/vec/lecturer' }, { label: s.title }]}
        title={s.title}
        description={s.kind === 'PE' ? `${s.subjectCode} · Thi thực hành · Paper ${s.pe?.examCode ?? ''} · ${s.durationMin} phút · ${fmtVnFull(s.startsAt)}` : `${s.subjectCode} · ${s.questionCount} câu · ${s.durationMin} phút · ${fmtVnFull(s.startsAt)}`}
        actions={
          <div className="vec-row">
            {s.status === 'LIVE' && <Button variant="secondary" icon={<PauseCircle className="ic" />} onClick={() => act('Chưa tạm dừng được', () => vec.action(s.id, 'pause'), 'Đã tạm dừng phòng thi')}>Tạm dừng</Button>}
            {s.status === 'PAUSED' && <Button icon={<PlayCircle className="ic" />} onClick={() => act('Chưa tiếp tục được', () => vec.action(s.id, 'resume'), 'Đã tiếp tục phòng thi')}>Tiếp tục</Button>}
            {live && <Button variant="secondary" icon={<AlarmClockPlus className="ic" />} onClick={() => setDialog({ k: 'extend' })}>Cộng giờ</Button>}
            {open && <Button variant="secondary" icon={<Megaphone className="ic" />} onClick={() => setDialog({ k: 'announce' })}>Thông báo</Button>}
            <Dropdown align="right" trigger={(p) => <button type="button" className="btn btn-secondary btn-icon" aria-label="Thêm thao tác" {...p}><MoreHorizontal className="ic" /></button>}>
              {(s.status === 'SCHEDULED' || s.status === 'LOBBY') && <MenuButton onClick={() => setDialog({ k: 'postpone' })} icon={<Flag className="ic" />}>Dời giờ thi</MenuButton>}
              {(s.status === 'SCHEDULED' || s.status === 'LOBBY') && <MenuButton danger onClick={() => setDialog({ k: 'cancel' })} icon={<Ban className="ic" />}>Hủy phiên</MenuButton>}
              {live && <MenuButton danger onClick={() => setDialog({ k: 'end' })} icon={<Ban className="ic" />}>Kết thúc phiên ngay</MenuButton>}
              {closed && s.settings.results.score === 'MANUAL' && <MenuButton onClick={() => setDialog({ k: 'release' })} icon={<Eye className="ic" />}>Công bố kết quả</MenuButton>}
              {closed && <><MenuSeparator /><MenuButton danger onClick={() => setDialog({ k: 'delete' })} icon={<Trash2 className="ic" />}>Xóa phiên</MenuButton></>}
            </Dropdown>
          </div>
        }
      >
        <div className="vec-session-bar">
          <div className="vec-sb-code"><small>Mã phòng</small><b>{formatRoomCode(s.roomCode)}</b>
            <button type="button" onClick={() => copy('code', s.roomCode)} aria-label="Chép mã phòng">{copied === 'code' ? <Check className="ic ic-sm" /> : <Copy className="ic ic-sm" />}</button>
          </div>
          {s.otp && (
            <div className="vec-sb-code"><small>OTP</small><b>{showOtp ? s.otp : '••••••'}</b>
              <button type="button" onClick={() => setShowOtp(!showOtp)} aria-label="Hiện hoặc ẩn OTP">{showOtp ? <EyeOff className="ic ic-sm" /> : <Eye className="ic ic-sm" />}</button>
              <button type="button" onClick={() => copy('otp', s.otp!)} aria-label="Chép OTP">{copied === 'otp' ? <Check className="ic ic-sm" /> : <Copy className="ic ic-sm" />}</button>
            </div>
          )}
          <Badge tone={s.status === 'LIVE' ? 'green' : s.status === 'PAUSED' ? 'amber' : closed ? 'gray' : 'violet'}>{s.status === 'LIVE' && <Radio className="ic ic-xs" />} {STATUS[s.status]}</Badge>
          <span className="vec-muted">{s.status === 'SCHEDULED' || s.status === 'LOBBY' ? `Bắt đầu sau ${clockText(s.startsAt - now)}` : live ? `Đóng phiên sau ${clockText(s.endsAt + s.pausedTotalSec * 1000 - now)}` : ''}</span>
          <span className="vec-muted">Giám sát: {PRESET_LABEL[s.settings.integrity.preset]}</span>
        </div>
        <div className="vec-seg vec-seg-lg" role="tablist" style={{ marginTop: 14 }}>
          <Link role="tab" aria-selected={tab === 'monitor'} className={cn(tab === 'monitor' && 'is-on')} to={`/app/vec/lecturer/${s.id}`}>Giám sát</Link>
          <Link role="tab" aria-selected={tab === 'results'} className={cn(tab === 'results' && 'is-on')} to={`/app/vec/lecturer/${s.id}/results`}>{s.kind === 'PE' ? 'Bài nộp và chấm điểm' : 'Kết quả'}</Link>
        </div>
      </PageHead>

      <div className="container vec-body">
        {tab === 'monitor' ? (
          <Monitor data={mon.data!} events={events} now={now} onDialog={setDialog} onApprove={(id, ok) => act('Chưa xử lý được', () => vec.decide(id, ok), ok ? 'Đã duyệt' : 'Đã từ chối')} />
        ) : (
          s.kind === 'PE' ? <PeGrading s={s} /> : <Results sessionId={s.id} />
        )}
      </div>

      <Dialogs
        dialog={dialog}
        s={s}
        close={() => setDialog(null)}
        act={act}
        onDeleted={() => nav('/app/vec/lecturer')}
      />
    </>
  );
}

/* ───────────────────────────── monitor ───────────────────────────── */

function Monitor({ data, events, now, onDialog, onApprove }: { data: MonitorDto; events: MonitorEvent[]; now: number; onDialog: (d: Dialog) => void; onApprove: (id: string, ok: boolean) => void }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'locked' | 'risk' | 'done'>('all');
  const [q, setQ] = useState('');
  const { rows, requests, session: s } = data;
  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => r.state === 'IN_PROGRESS' || r.state === 'LOBBY').length,
    locked: rows.filter((r) => r.state === 'SUSPENDED').length,
    risk: rows.filter((r) => riskLevel(r.risk) !== 'LOW').length,
    done: rows.filter((r) => ['SUBMITTED', 'AUTO_SUBMITTED', 'FORCE_SUBMITTED'].includes(r.state)).length,
  }), [rows]);
  const list = useMemo(() => {
    const k = foldVi(q.trim());
    return rows
      .filter((r) => (filter === 'all' ? true : filter === 'active' ? r.state === 'IN_PROGRESS' || r.state === 'LOBBY' : filter === 'locked' ? r.state === 'SUSPENDED' : filter === 'risk' ? riskLevel(r.risk) !== 'LOW' : ['SUBMITTED', 'AUTO_SUBMITTED', 'FORCE_SUBMITTED'].includes(r.state)))
      .filter((r) => !k || foldVi(`${r.fullName} ${r.studentCode} ${r.email}`).includes(k))
      .sort((a, b) => (a.state === 'SUSPENDED' ? -1 : 0) - (b.state === 'SUSPENDED' ? -1 : 0) || b.risk - a.risk || a.fullName.localeCompare(b.fullName, 'vi'));
  }, [rows, filter, q]);
  const canAct = s.status !== 'ENDED' && s.status !== 'CANCELLED';

  return (
    <div className="vec-mon">
      <div className="vec-kpis">
        <Kpi label="Đã vào phòng" value={counts.all} />
        <Kpi label="Đang làm bài" value={rows.filter((r) => r.state === 'IN_PROGRESS').length} tone="green" />
        <Kpi label="Bị khóa" value={counts.locked} tone={counts.locked ? 'red' : undefined} />
        <Kpi label="Đã nộp" value={counts.done} />
        <Kpi label="Yêu cầu chờ" value={requests.length} tone={requests.length ? 'amber' : undefined} />
      </div>

      {requests.length > 0 && (
        <section className="vec-requests" aria-label="Yêu cầu đang chờ">
          <h3><CircleAlert className="ic" /> Yêu cầu đang chờ ({requests.length})</h3>
          <ul>
            {requests.map((r) => (
              <li key={r.id}>
                <div><b>{r.name}</b> <Badge tone={r.kind === 'UNLOCK' ? 'red' : 'violet'}>{r.kind === 'UNLOCK' ? 'Xin mở khóa' : 'Xin làm lại'}</Badge>
                  <small>{r.lockReason ? `Bị khóa: ${r.lockReason}. ` : ''}{r.reason || 'Không có lời nhắn.'}</small></div>
                <div className="vec-row">
                  <Button size="sm" onClick={() => onApprove(r.id, true)} icon={<Check className="ic" />}>Duyệt</Button>
                  <Button size="sm" variant="secondary" onClick={() => onApprove(r.id, false)}>Từ chối</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="vec-mon-grid">
        <section className="vec-card vec-mon-table">
          <div className="vec-mon-tools">
            <div className="vec-seg" role="tablist">
              {([['all', 'Tất cả'], ['active', 'Đang thi'], ['locked', 'Bị khóa'], ['risk', 'Rủi ro'], ['done', 'Đã nộp']] as const).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={cn(filter === k && 'is-on')} onClick={() => setFilter(k)}>{l} <i>{counts[k]}</i></button>
              ))}
            </div>
            <Input icon={<Search className="ic" />} sizeVariant="sm" placeholder="Tìm tên, mã SV" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!rows.length ? (
            <p className="vec-empty"><Users className="ic ic-lg" />Chưa có thí sinh nào vào phòng. Đọc mã <b>{formatRoomCode(s.roomCode)}</b> cho sinh viên.</p>
          ) : (
            <div className="vec-tablewrap">
              <table className="vec-table vec-table-mon">
                <thead><tr><th>Thí sinh</th><th>Trạng thái</th><th>{s.kind === 'PE' ? 'Bài nộp' : 'Tiến độ'}</th><th>Còn lại</th><th>Rủi ro</th><th /></tr></thead>
                <tbody>
                  {list.map((r) => {
                    const risk = riskLevel(r.risk);
                    const left = r.deadlineAt && r.state === 'IN_PROGRESS' ? r.deadlineAt - now : null;
                    return (
                      <tr key={r.attemptId} className={cn(r.state === 'SUSPENDED' && 'is-locked')}>
                        <td>
                          <b>{r.fullName}</b>
                          <small>{r.studentCode || r.email}{r.accountName && r.accountName !== r.fullName ? ` · tài khoản ${r.accountName}` : ''}</small>
                        </td>
                        <td>
                          <Badge tone={stateTone(r.state)}>{r.state === 'SUSPENDED' && <Lock className="ic ic-xs" />} {STATE_LABEL[r.state]}</Badge>
                          <small>{r.maxAttempts > 1 ? `Lượt ${r.attemptNo}/${r.maxAttempts} · ` : ''}{['IN_PROGRESS', 'SUSPENDED'].includes(r.state) ? (r.online ? 'trực tuyến' : 'mất tín hiệu') : ''}{r.fullscreen === false && r.state === 'IN_PROGRESS' ? ' · không toàn màn hình' : ''}</small>
                          {r.state === 'SUSPENDED' && <small className="vec-lockwhy">{r.lockReason}</small>}
                        </td>
                        <td>
                          {r.pe ? (
                            <>
                              <b className="pe-mon-n">{r.pe.submissions ? `${r.pe.submissions} lần nộp` : 'Chưa nộp'}</b>
                              <small>{r.pe.lastAt ? `Mới nhất ${fmtVnTime(r.pe.lastAt)} · ${fmtBytes(r.pe.bytes)}` : '—'}{r.pe.closed ? ' · đã đóng' : ''}{r.score10 != null ? ` · ${r.score10} điểm` : ''}</small>
                            </>
                          ) : (
                            <>
                              <div className="vec-prog"><i style={{ width: `${r.total ? (r.answered / r.total) * 100 : 0}%` }} /></div>
                              <small>{r.answered}/{r.total} câu{r.score10 != null ? ` · ${r.score10} điểm` : ''}</small>
                            </>
                          )}
                        </td>
                        <td className="vec-mono">{left != null ? clockText(left) : '—'}</td>
                        <td><span className={cn('vec-risk', `is-${risk.toLowerCase()}`)}>{RISK_LABEL[risk]}</span><small>{r.lock} khóa · {r.warn} cảnh báo</small></td>
                        <td className="vec-act">
                          {r.state === 'SUSPENDED' && canAct && <Button size="sm" onClick={() => onDialog({ k: 'resume', row: r })} icon={<LockOpen className="ic" />}>Mở khóa</Button>}
                          {canAct && ['IN_PROGRESS', 'SUSPENDED', 'LOBBY'].includes(r.state) && (
                            <Dropdown align="right" portal trigger={(p) => <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Thao tác với ${r.fullName}`} {...p}><MoreHorizontal className="ic" /></button>}>
                              <MenuButton onClick={() => onDialog({ k: 'announce', row: r })} icon={<Megaphone className="ic" />}>Nhắn riêng</MenuButton>
                              {r.state === 'IN_PROGRESS' && <MenuButton onClick={() => onDialog({ k: 'extend', row: r })} icon={<AlarmClockPlus className="ic" />}>Cộng giờ</MenuButton>}
                              {!r.pe && <MenuButton onClick={() => onDialog({ k: 'redo', row: r })} icon={<RotateCcw className="ic" />}>Cho làm lại đề mới</MenuButton>}
                              {r.state !== 'LOBBY' && <MenuButton onClick={() => onDialog({ k: 'force', row: r })} icon={<Send className="ic" />}>Thu bài ngay</MenuButton>}
                              <MenuSeparator />
                              <MenuButton danger onClick={() => onDialog({ k: 'remove', row: r })} icon={<UserMinus className="ic" />}>Loại khỏi phòng</MenuButton>
                            </Dropdown>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!list.length && <p className="vec-empty">Không có thí sinh nào khớp bộ lọc.</p>}
            </div>
          )}
        </section>

        <section className="vec-card vec-feed" aria-label="Nhật ký trực tiếp">
          <h3>Nhật ký trực tiếp</h3>
          {!events.length ? <p className="vec-muted">Chưa có sự kiện nào.</p> : (
            <ol>
              {events.slice().reverse().slice(0, 80).map((e) => (
                <li key={e.id} className={`is-${e.severity.toLowerCase()}`}>
                  <time>{fmtVnTime(e.at)}</time>
                  <span><b>{e.name}</b> {e.label}{e.data && (e.data as { merged?: boolean }).merged ? ' (gộp)' : ''}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'red' | 'amber' }) {
  return <div className={cn('vec-kpi', tone && `is-${tone}`)}><b>{value}</b><span>{label}</span></div>;
}

/* ───────────────────────────── results ───────────────────────────── */

function Results({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const q = useQuery({ queryKey: vecKeys.results(sessionId), queryFn: () => vec.results(sessionId), staleTime: 5000 });
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <Skeleton style={{ height: 240 }} />;
  if (q.isError || !q.data) return <ErrorState description={(q.error as Error | null)?.message} onRetry={() => q.refetch()} />;
  const { stats, distribution, rows, session: s } = q.data;
  const max = Math.max(1, ...distribution);
  const download = async () => {
    setBusy(true);
    try {
      const r = await http.get(csvUrl(sessionId).replace(/^\/api/, ''), { responseType: 'blob' });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ket-qua-${s.roomCode}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Chưa xuất được', toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };
  const f = (n: number | null, d = 2) => (n == null ? '—' : String(Math.round(n * 10 ** d) / 10 ** d));
  return (
    <div className="vec-results">
      <div className="vec-kpis">
        <Kpi label="Thí sinh" value={stats.candidates} />
        <Kpi label="Đã có điểm" value={stats.submitted} />
        <div className="vec-kpi"><b>{f(stats.avg)}</b><span>Điểm trung bình</span></div>
        <div className="vec-kpi"><b>{f(stats.median)}</b><span>Trung vị</span></div>
        <div className="vec-kpi"><b>{stats.passRate != null ? `${f(stats.passRate, 1)}%` : '—'}</b><span>Tỉ lệ đạt (≥ {s.settings.scoring.passMark})</span></div>
      </div>
      <section className="vec-card">
        <div className="vec-review-head"><h3>Phân bố điểm</h3><Button variant="secondary" size="sm" onClick={download} loading={busy} icon={<Download className="ic" />}>Xuất CSV</Button></div>
        <div className="vec-hist-bars" role="img" aria-label="Biểu đồ phân bố điểm theo khoảng một điểm">
          {distribution.map((n, i) => (
            <div key={i} className="vec-hb"><span className="vec-hb-n">{n || ''}</span><i style={{ height: `${(n / max) * 100}%` }} className={cn(i + 1 >= s.settings.scoring.passMark ? 'is-pass' : 'is-fail')} /><span>{i}–{i + 1}</span></div>
          ))}
        </div>
        <p className="vec-fine">Điểm lấy theo cách tính “{RETAKE_SCORING_LABEL[s.settings.retake.scoring]}”. Độ lệch chuẩn {f(stats.stdev)}.</p>
      </section>
      <section className="vec-card vec-tablewrap">
        <table className="vec-table">
          <thead><tr><th>#</th><th>Thí sinh</th><th>Lớp</th><th>Lượt</th><th>Điểm</th><th>Đúng/Sai/Trống</th><th>Nộp lúc</th><th>Khóa/Cảnh báo</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.userId}>
                <td>{i + 1}</td>
                <td><b>{r.fullName}</b><small>{r.studentCode} · {r.email}</small></td>
                <td>{r.className || '—'}</td>
                <td>{r.attempts}</td>
                <td>{r.counted != null ? <b className={cn('vec-score-pill', r.counted >= s.settings.scoring.passMark ? 'is-pass' : 'is-fail')} title={gradeLabel(r.counted)}>{r.counted}</b> : <span className="vec-muted">—</span>}</td>
                <td className="vec-mono">{r.correct ?? '—'}/{r.wrong ?? '—'}/{r.blank ?? '—'}</td>
                <td>{r.submittedAt ? `${fmtVnTime(r.submittedAt)}, ${fmtVnDate(r.submittedAt)}` : '—'}</td>
                <td><span className={cn('vec-risk', `is-${riskLevel(r.risk).toLowerCase()}`)}>{r.lock}/{r.warn}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="vec-empty">Chưa có thí sinh nào.</p>}
      </section>
    </div>
  );
}

/* ───────────────────────────── dialogs ───────────────────────────── */

function Dialogs({ dialog, s, close, act, onDeleted }: { dialog: Dialog; s: VecSessionDto; close: () => void; act: (label: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>; onDeleted: () => void }) {
  const [bonus, setBonus] = useState<'NONE' | 'LOCKED_TIME' | 'CUSTOM'>('NONE');
  const [minutes, setMinutes] = useState(5);
  const [counts, setCounts] = useState(false);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'GRADE_SAVED' | 'VOID'>('GRADE_SAVED');
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const k = dialog?.k;
  useEffect(() => {
    setBonus('NONE'); setMinutes(5); setCounts(false); setReason(''); setMode('GRADE_SAVED'); setText(''); setUrgent(false); setConfirm('');
    if (k === 'postpone') {
      const p = vnParts(s.startsAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      setDate(`${p.y}-${pad(p.mo)}-${pad(p.d)}`);
      setTime(`${pad(p.h)}:${pad(p.mi)}`);
    }
  }, [k, s.startsAt]);
  if (!dialog) return null;
  const row = 'row' in dialog ? dialog.row : undefined;
  const footer = (label: string, onClick: () => void, opts: { danger?: boolean; disabled?: boolean } = {}) => (
    <>
      <Button variant="secondary" onClick={close}>Hủy</Button>
      <Button variant={opts.danger ? 'danger' : 'primary'} disabled={opts.disabled} onClick={onClick}>{label}</Button>
    </>
  );

  switch (dialog.k) {
    case 'resume':
      return (
        <Modal open onClose={close} title={`Mở khóa cho ${row!.fullName}?`} description={`Lý do khóa: ${row!.lockReason ?? '—'}. Đáp án đã chọn được giữ nguyên.`} size="sm" footer={footer('Mở khóa', () => void act('Chưa mở khóa được', () => vec.resumeLock(row!.attemptId, bonus, minutes), 'Đã mở khóa'))}>
          <div className="vec-radios">
            <label><input type="radio" checked={bonus === 'NONE'} onChange={() => setBonus('NONE')} /> Không cộng giờ</label>
            <label><input type="radio" checked={bonus === 'LOCKED_TIME'} onChange={() => setBonus('LOCKED_TIME')} /> Cộng bù đúng thời gian bị khóa{row!.lockedAt ? ` (${clockText(serverNow() - row!.lockedAt)})` : ''}</label>
            <label><input type="radio" checked={bonus === 'CUSTOM'} onChange={() => setBonus('CUSTOM')} /> Cộng thêm <input className="vec-inline-num" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(120, Number(e.target.value.replace(/\D/g, '')) || 1)))} /> phút</label>
          </div>
        </Modal>
      );
    case 'redo':
      return (
        <Modal open onClose={close} title={`Cho ${row!.fullName} làm lại bằng đề mới?`} description="Lượt hiện tại bị hủy và không tính điểm. Thí sinh nhận đề mới ngay trong phòng." size="sm" footer={footer('Cho làm lại', () => void act('Chưa cho làm lại được', () => vec.redo(row!.attemptId, counts, reason), 'Đã tạo lượt mới'))}>
          <label className="vec-check"><input type="checkbox" checked={counts} onChange={(e) => setCounts(e.target.checked)} /> Tính vào số lần làm lại của thí sinh</label>
          <Field label="Ghi chú (không bắt buộc)"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
        </Modal>
      );
    case 'remove':
      return (
        <Modal open onClose={close} title={`Loại ${row!.fullName} khỏi phòng?`} description="Thí sinh bị đưa ra khỏi phòng và không làm lại được." size="sm" footer={footer('Loại khỏi phòng', () => void act('Chưa loại được', () => vec.removeCandidate(row!.attemptId, mode, reason.trim()), 'Đã loại khỏi phòng'), { danger: true, disabled: reason.trim().length < 3 })}>
          <div className="vec-radios">
            <label><input type="radio" checked={mode === 'GRADE_SAVED'} onChange={() => setMode('GRADE_SAVED')} /> Chấm phần đã làm và giữ điểm</label>
            <label><input type="radio" checked={mode === 'VOID'} onChange={() => setMode('VOID')} /> Hủy bài, không có điểm</label>
          </div>
          <Field label="Lý do (bắt buộc)"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
        </Modal>
      );
    case 'force':
      return <Modal open onClose={close} title={`Thu bài của ${row!.fullName} ngay?`} description="Hệ thống chấm phần đã làm và khóa bài, thí sinh không sửa được nữa." size="sm" footer={footer('Thu bài', () => void act('Chưa thu được', () => vec.forceSubmit(row!.attemptId), 'Đã thu bài'))} />;
    case 'extend':
      return (
        <Modal open onClose={close} title={row ? `Cộng giờ cho ${row.fullName}` : 'Cộng giờ cho cả phòng'} description={row ? undefined : 'Mọi thí sinh đang thi được thêm giờ và phiên kéo dài tương ứng.'} size="sm" footer={footer('Cộng giờ', () => void act('Chưa cộng giờ được', () => vec.extend(s.id, minutes, row ? [row.attemptId] : undefined), `Đã cộng ${minutes} phút`))}>
          <Field label="Số phút cộng thêm"><div className="vec-quick">{[5, 10, 15, 30].map((m) => <button key={m} type="button" className={cn(minutes === m && 'is-on')} onClick={() => setMinutes(m)}>{m}</button>)}<Input value={minutes} inputMode="numeric" onChange={(e) => setMinutes(Math.max(1, Math.min(120, Number(e.target.value.replace(/\D/g, '')) || 1)))} /></div></Field>
        </Modal>
      );
    case 'announce':
      return (
        <Modal open onClose={close} title={row ? `Nhắn riêng cho ${row.fullName}` : 'Thông báo cho cả phòng'} size="sm" footer={footer('Gửi', () => void act('Chưa gửi được', () => vec.announce(s.id, text.trim(), urgent, row?.attemptId), 'Đã gửi thông báo'), { disabled: !text.trim() })}>
          <Field label="Nội dung (tối đa 500 ký tự)"><textarea className="textarea" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} autoFocus /></Field>
          <label className="vec-toggle vec-toggle-block"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /><i /><span>Thông báo khẩn<small>Hiện hộp thoại giữa màn hình thí sinh, buộc họ bấm “Đã hiểu”.</small></span></label>
        </Modal>
      );
    case 'end':
      return <Modal open onClose={close} title="Kết thúc phiên thi ngay?" description="Mọi bài đang làm được chấm và thu ngay. Không hoàn tác được." size="sm" footer={footer('Kết thúc phiên', () => void act('Chưa kết thúc được', () => vec.action(s.id, 'end'), 'Phiên đã kết thúc'), { danger: true })} />;
    case 'cancel':
      return <Modal open onClose={close} title="Hủy phiên thi?" description="Thí sinh đã vào phòng chờ sẽ bị đóng phòng. Không hoàn tác được." size="sm" footer={footer('Hủy phiên', () => void act('Chưa hủy được', () => vec.action(s.id, 'cancel'), 'Đã hủy phiên'), { danger: true })} />;
    case 'release':
      return <Modal open onClose={close} title="Công bố kết quả?" description="Thí sinh sẽ thấy điểm và chi tiết theo thiết lập của phiên." size="sm" footer={footer('Công bố', () => void act('Chưa công bố được', () => vec.action(s.id, 'release-results'), 'Đã công bố kết quả'))} />;
    case 'postpone':
      return (
        <Modal open onClose={close} title="Dời giờ thi" description="Thí sinh trong phòng chờ sẽ nhận thông báo giờ mới." size="sm" footer={footer('Dời giờ', () => void act('Chưa dời được', () => vec.postpone(s.id, vnToIso(date, time)), 'Đã dời giờ thi'), { disabled: !Number.isFinite(vnToMs(date, time)) })}>
          <div className="vec-form2"><Field label="Ngày (GMT+7)"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Giờ (GMT+7)"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>
        </Modal>
      );
    case 'delete':
      return (
        <Modal open onClose={close} title="Xóa phiên thi?" description={s.kind === 'PE' ? `Xóa vĩnh viễn phiên, mọi bài nộp của ${s.counts.joined} thí sinh, điểm, ghi chú, đề và tài liệu đã tải lên cho phiên này. Không khôi phục được. Hãy tải bài và xuất CSV trước nếu cần.` : `Xóa vĩnh viễn phiên, bài làm và kết quả của ${s.counts.joined} thí sinh. Hãy xuất CSV trước nếu cần.`} size="sm" footer={footer('Xóa vĩnh viễn', () => void act('Chưa xóa được', async () => { await vec.remove(s.id, confirm); onDeleted(); }, 'Đã xóa phiên'), { danger: true, disabled: confirm.replace(/\D/g, '') !== s.roomCode })}>
          <Field label={`Nhập mã phòng ${formatRoomCode(s.roomCode)} để xác nhận`}><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} inputMode="numeric" /></Field>
        </Modal>
      );
  }
}
