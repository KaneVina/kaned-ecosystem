import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenText, Check, CheckCircle2, CircleAlert, Clock, Download, ExternalLink, Eye, FileArchive, Files, FolderOpen, FolderUp, Hash, Info, Lock, Megaphone, PauseCircle, Send, ShieldCheck, TriangleAlert, Upload, Wifi, WifiOff, X,
} from 'lucide-react';
import { clockText, fmtBytes, fmtVnFull, PE_NOTE_MAX, type AttemptStateDto, type HeartbeatResponse, type PeRoomDto, type PeSubmissionDto } from '@kaned/shared';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Feedback';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import { vec } from '../api';
import { serverNow, useHeartbeat, useServerTick } from '../hooks';
import { FormatTag } from './ItemPicker';
import { openDownload, peApi, peKeys, sendBlob, sha256Hex } from './peApi';
import { buildSolution, filesFromDrop, packSolution, type PickedFile, type Solution } from './solution';
import '../vec.css';
import './pe.css';

const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtStamp = (ms: number) => timeFmt.format(ms);
export const paperWindowName = (id: string) => `kaned-pe-paper-${id}`;

/** Practical exam room: the PEA-style "Submit Solution" client. */
export function PeRoom({ a, onChange }: { a: AttemptStateDto; onChange: () => void }) {
  const room = useQuery({ queryKey: peKeys.room(a.id), queryFn: () => peApi.room(a.id), staleTime: 0, retry: 1 });
  if (room.isLoading) return <div className="vec-room-page pe-page"><div className="vec-center"><Skeleton style={{ height: 420, width: 'min(1080px, 94vw)' }} /></div></div>;
  if (room.isError || !room.data) {
    return (
      <div className="vec-room-page pe-page">
        <div className="vec-center"><div className="vec-note"><CircleAlert className="ic" /><h2>Không mở được phòng thi</h2><p>{(room.error as Error | null)?.message}</p><Link to="/app/vec" className="btn btn-primary">Về Phòng thi ảo</Link></div></div>
      </div>
    );
  }
  if (a.state === 'LOBBY') return <PeLobby a={a} room={room.data} onStarted={onChange} />;
  if (room.data.closedAt) return <PeDone a={a} room={room.data} />;
  return <PeClient a={a} room={room.data} onChange={onChange} />;
}

/* ───────────────────────────── lobby ───────────────────────────── */

function PeLobby({ a, room, onStarted }: { a: AttemptStateDto; room: PeRoomDto; onStarted: () => void }) {
  const toast = useToast();
  const now = useServerTick(1000);
  const [busy, setBusy] = useState(false);
  const s = a.session;
  const live = s.status === 'LIVE' && now >= s.startsAt;
  const closed = s.status === 'ENDED' || s.status === 'CANCELLED';
  const desktopOk = !s.settings.integrity.desktopOnly || window.innerWidth >= 900;
  const start = async () => {
    setBusy(true);
    try {
      const r = await vec.start(a.id);
      if (r.connectionId) sessionStorage.setItem(`vec:conn:${a.id}`, r.connectionId);
      onStarted();
    } catch (e) {
      toast.error('Chưa vào phòng được', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vec-room-page pe-page">
      <div className="pe-lobby">
        <div className="pe-lobby-card">
          <span className="pe-eyebrow"><FolderUp className="ic ic-sm" /> Phòng thi thực hành</span>
          <h1>{s.title}</h1>
          <p className="pe-lobby-sub">{s.subjectCode} · {s.subjectName} · GV {s.lecturerDisplay}</p>
          <div className="pe-lobby-clock" aria-live="polite">
            {closed ? <b>Phòng thi đã đóng</b> : live ? <b>Đã đến giờ thi</b> : <><small>Bắt đầu sau</small><b className="vec-mono">{clockText(s.startsAt - now)}</b></>}
          </div>
          <dl className="pe-kv">
            <div><dt>Student</dt><dd>{a.candidate.fullName}{a.candidate.studentCode ? ` · ${a.candidate.studentCode}` : ''}</dd></div>
            <div><dt>Paper no</dt><dd className="vec-mono">{room.examCode}</dd></div>
            <div><dt>Bắt đầu</dt><dd>{fmtVnFull(s.startsAt)}</dd></div>
            <div><dt>Thời gian</dt><dd>{s.durationMin} phút</dd></div>
            <div><dt>Đề thi</dt><dd>{room.paper.length} tệp</dd></div>
            <div><dt>Tài liệu kèm</dt><dd>{room.materials.length ? `${room.materials.length} tệp` : 'Không có'}</dd></div>
          </dl>
          {s.instructions && <div className="pe-guide"><b>Submit guide</b><p>{s.instructions}</p></div>}
          {!desktopOk && <p className="vec-err vec-err-block">Phòng thi này chỉ mở trên máy tính (màn hình rộng từ 900px).</p>}
          <Button size="lg" block disabled={!live || closed || !desktopOk} loading={busy} onClick={start} icon={<FolderOpen className="ic" />}>
            {live ? 'Vào phòng làm bài' : 'Chờ đến giờ thi'}
          </Button>
          <p className="vec-fine">Đề thi chỉ mở được sau khi vào phòng. Trang này tự cập nhật khi đến giờ.</p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── the client ───────────────────────────── */

type Phase = { k: 'idle' } | { k: 'pack'; p: number } | { k: 'hash' } | { k: 'upload'; p: number } | { k: 'save' } | { k: 'ok'; sub: PeSubmissionDto } | { k: 'error'; msg: string };

function PeClient({ a, room, onChange }: { a: AttemptStateDto; room: PeRoomDto; onChange: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const now = useServerTick(500);
  const s = a.session;
  const cfg = room.submission;
  const [deadline, setDeadline] = useState(a.deadlineAt ?? serverNow() + s.durationMin * 60_000);
  const [paused, setPaused] = useState(s.status === 'PAUSED');
  const [ended, setEnded] = useState(a.state !== 'IN_PROGRESS');
  const [banner, setBanner] = useState<{ text: string; urgent: boolean } | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [latestOnly, setLatestOnly] = useState(false);
  const [signed, setSigned] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const paperWin = useRef<Window | null>(null);
  // Tells the paper window the exam is over. A fresh channel each time: nothing to keep open or close twice.
  const channel = useMemo(
    () => ({
      postMessage: (msg: string) => {
        try {
          const ch = new BroadcastChannel(`kaned-pe-${a.id}`);
          ch.postMessage(msg);
          ch.close();
        } catch {
          /* old browsers: the paper window finds out on its next request */
        }
      },
    }),
    [a.id],
  );

  const connectionId = sessionStorage.getItem(`vec:conn:${a.id}`) ?? a.connectionId;
  const hb = useHeartbeat({
    attemptId: a.id,
    active: !ended,
    connectionId,
    read: () => ({ fullscreen: !!document.fullscreenElement, visible: !document.hidden, focused: document.hasFocus(), current: 0, answered: room.submissions.length }),
    onResponse: (r: HeartbeatResponse) => {
      if (r.deadlineAt) setDeadline(r.deadlineAt);
      setPaused(r.sessionStatus === 'PAUSED');
      for (const c of r.commands) {
        if (c.type === 'MESSAGE') {
          setBanner({ text: c.body, urgent: c.urgent });
          if (!c.urgent) setTimeout(() => setBanner((b) => (b?.text === c.body ? null : b)), 15_000);
        }
      }
      if (r.attemptState !== 'IN_PROGRESS') {
        setEnded(true);
        channel?.postMessage('ended');
        void qc.invalidateQueries({ queryKey: peKeys.room(a.id) });
      }
    },
  });

  const remaining = deadline - now;
  const timeUp = remaining <= 0;
  const busy = phase.k === 'pack' || phase.k === 'hash' || phase.k === 'upload' || phase.k === 'save';
  const canSubmit = !ended && !paused && !timeUp;

  // Leaving with work in progress needs a word from the proctor.
  useEffect(() => {
    if (ended) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [ended]);

  useEffect(() => {
    if (timeUp && !ended) {
      channel?.postMessage('ended');
      const t = setTimeout(onChange, 4000);
      return () => clearTimeout(t);
    }
  }, [timeUp, ended, channel, onChange]);

  const showPaper = () => {
    const w = window.open(`/vec/paper/${a.id}`, paperWindowName(a.id), 'popup=yes,width=1120,height=880,left=60,top=40');
    if (!w) {
      toast.error('Trình duyệt chặn cửa sổ đề thi', 'Cho phép cửa sổ bật lên (pop-up) cho Kaned rồi bấm lại Show paper.');
      return;
    }
    paperWin.current = w;
    w.focus();
  };

  const downloadMaterial = async (ref: string) => {
    try {
      openDownload(await peApi.material(a.id, ref));
    } catch (e) {
      toast.error('Chưa tải được', toApiError(e).message);
    }
  };
  const downloadAll = async () => {
    for (const m of room.materials) {
      await downloadMaterial(m.id);
      await new Promise((r) => setTimeout(r, 700));
    }
  };

  const pick = (kind: 'folder' | 'files', files: PickedFile[]) => {
    if (!files.length) return;
    setSolution(buildSolution(kind, files, cfg));
    setPhase({ k: 'idle' });
  };
  const fromInput = (kind: 'folder' | 'files', list: FileList | null) => {
    if (!list) return;
    pick(kind, [...list].map((f) => ({ file: f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name })));
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (!canSubmit || busy) return;
    const r = await filesFromDrop(e.dataTransfer, cfg.skipBuildDirs);
    if (!r) return;
    if (r.kind === 'folder' && !cfg.allowFolder) return toast.error('Phòng thi này không nhận cả thư mục', 'Hãy chọn từng tệp bài làm.');
    if (r.kind === 'files' && !cfg.allowFiles) return toast.error('Phòng thi này nhận thư mục bài làm', 'Kéo cả thư mục vào, hoặc bấm Browse.');
    pick(r.kind, r.files);
  };

  const tooBig = solution ? solution.bytes > cfg.maxSizeMb * 1024 * 1024 * (solution.kind === 'folder' ? 4 : 1) : false;
  const submit = async () => {
    if (!solution || !solution.files.length) return;
    const zipName = `${room.examCode}_${(a.candidate.studentCode || a.candidate.fullName || 'solution').replace(/[^\w-]+/g, '')}.zip`;
    try {
      setPhase({ k: 'pack', p: 0 });
      const packed = await packSolution(solution, zipName, (p) => setPhase({ k: 'pack', p }));
      if (packed.blob.size > cfg.maxSizeMb * 1024 * 1024) throw new Error(`Bài làm sau khi nén là ${fmtBytes(packed.blob.size)}, vượt quá ${cfg.maxSizeMb} MB. Bỏ bớt tệp không cần thiết rồi nộp lại.`);
      setPhase({ k: 'hash' });
      const sha256 = await sha256Hex(packed.blob);
      const ticket = await peApi.sign('SUBMISSION', packed.name, packed.blob.size, a.id);
      setPhase({ k: 'upload', p: 0 });
      await sendBlob(ticket, packed.blob, packed.name, (p) => setPhase({ k: 'upload', p }));
      setPhase({ k: 'save' });
      const out = await peApi.submit(a.id, {
        fileId: ticket.fileId,
        path: solution.kind === 'folder' ? `${solution.label}/` : solution.label,
        fileCount: solution.files.length,
        sha256,
        note: note.trim() || undefined,
        skipped: solution.skipped.length,
      });
      qc.setQueryData(peKeys.room(a.id), out);
      setPhase({ k: 'ok', sub: out.submissions[0]! });
      setNote('');
    } catch (e) {
      setPhase({ k: 'error', msg: toApiError(e).message || (e as Error).message });
    }
  };

  const close = async () => {
    setClosing(true);
    try {
      const out = await peApi.close(a.id);
      channel?.postMessage('closed');
      try {
        paperWin.current?.close();
      } catch {
        /* the window may already be gone */
      }
      qc.setQueryData(peKeys.room(a.id), out);
      setConfirmClose(false);
      onChange();
    } catch (e) {
      toast.error('Chưa đóng được', toApiError(e).message);
    } finally {
      setClosing(false);
    }
  };

  const history = latestOnly ? room.submissions.slice(0, 1) : room.submissions;
  const low = remaining < 5 * 60_000;
  const step1Done = Boolean(solution?.files.length) || room.submissions.length > 0;
  const step2Done = room.submissions.length > 0;

  return (
    <div className={cn('vec-room-page pe-page', room.protect.noCopy && 'pe-nocopy')}>
      <div className="pe-window" role="main">
        <header className="pe-titlebar">
          <div className="pe-brand"><span className="pe-logo"><FolderUp className="ic" /></span><div><b>Submit Solution</b><small>Kaned · Phòng thi thực hành</small></div></div>
          <div className="pe-titlebar-mid">
            <span className={cn('pe-monitor', !hb.online && 'is-off')}>{hb.online ? <Wifi className="ic ic-sm" /> : <WifiOff className="ic ic-sm" />}<i /> {hb.online ? 'Your system is monitored!' : 'Mất kết nối, đang thử lại…'}</span>
          </div>
          <div className={cn('pe-clock', low && !ended && 'is-low', (ended || timeUp) && 'is-over')} aria-live="polite">
            <Clock className="ic" />
            <span><small>{ended || timeUp ? 'Hết giờ' : paused ? 'Tạm dừng' : 'Còn lại'}</small><b className="vec-mono">{ended || timeUp ? '00:00' : clockText(remaining)}</b></span>
          </div>
        </header>

        {banner && (
          <div className={cn('pe-banner', banner.urgent && 'is-urgent')} role="status">
            <Megaphone className="ic" /><span><b>Thông báo từ giám thị</b>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)} aria-label="Đóng thông báo"><X className="ic ic-sm" /></button>
          </div>
        )}
        {paused && <div className="pe-banner is-paused" role="status"><PauseCircle className="ic" /><span><b>Phòng thi đang tạm dừng</b>Đồng hồ dừng lại. Chờ giám thị tiếp tục.</span></div>}
        {(ended || timeUp) && (
          <div className="pe-banner is-over" role="status"><Lock className="ic" /><span><b>Đã hết thời gian làm bài</b>Không nộp thêm được nữa. Ký tên vào danh sách thí sinh rồi bấm Close ở bước 3.</span></div>
        )}

        <section className="pe-head">
          <dl className="pe-kv pe-kv-head">
            <div className="is-wide"><dt>Test name</dt><dd>{s.title}</dd></div>
            <div><dt>Student</dt><dd>{a.candidate.fullName}{a.candidate.studentCode && <small> · {a.candidate.studentCode}</small>}</dd></div>
            <div><dt>Paper no</dt><dd className="vec-mono pe-paperno">{room.examCode}</dd></div>
          </dl>
          <div className="pe-head-actions">
            <Button size="lg" icon={<BookOpenText className="ic" />} onClick={showPaper} disabled={ended || timeUp}>Show paper</Button>
            <Button size="lg" variant="secondary" icon={<Download className="ic" />} disabled={!room.materials.length || ended || timeUp} onClick={() => (room.materials.length === 1 ? void downloadMaterial(room.materials[0]!.id) : setMaterialsOpen(true))}>
              Download given materials
            </Button>
            {!room.materials.length && <small className="vec-muted">Phòng này không có tài liệu kèm theo.</small>}
          </div>
        </section>

        <div className="pe-body">
          <div className="pe-steps">
            {/* Step 1 */}
            <section className={cn('pe-step', step1Done && 'is-done')}>
              <header><span className="pe-step-n">{step1Done ? <Check className="ic ic-sm" /> : 1}</span><div><b>Step 1</b><span>Chọn bài làm</span></div></header>
              <div
                className={cn('pe-drop pe-solution', drag && 'is-drag', !canSubmit && 'is-off')}
                onDragOver={(e) => { e.preventDefault(); if (canSubmit) setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => void onDrop(e)}
              >
                <div className="pe-saved">
                  <span>Saved at</span>
                  <b className="vec-mono clamp-1">{solution ? (solution.kind === 'folder' ? `${solution.label}/` : solution.label) : 'Chưa chọn thư mục bài làm'}</b>
                </div>
                <div className="pe-browse">
                  {cfg.allowFolder && <Button variant="secondary" icon={<FolderOpen className="ic" />} disabled={!canSubmit || busy} onClick={() => folderInput.current?.click()}>Browse folder</Button>}
                  {cfg.allowFiles && <Button variant="ghost" icon={<Files className="ic" />} disabled={!canSubmit || busy} onClick={() => filesInput.current?.click()}>Chọn tệp</Button>}
                  <input ref={folderInput} type="file" hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => { fromInput('folder', e.target.files); e.target.value = ''; }} />
                  <input ref={filesInput} type="file" hidden multiple accept={cfg.allowedExts.length ? cfg.allowedExts.map((x) => `.${x}`).join(',') : undefined} onChange={(e) => { fromInput('files', e.target.files); e.target.value = ''; }} />
                </div>
                <small className="pe-drop-hint">hoặc kéo thả {cfg.allowFolder ? 'thư mục bài làm' : 'tệp'} vào đây · tối đa {cfg.maxSizeMb} MB{cfg.allowedExts.length ? ` · ${cfg.allowedExts.map((x) => `.${x}`).join(' ')}` : ''}</small>
              </div>
              {solution && (
                <div className="pe-picked-sum">
                  <div className="pe-sum-row">
                    <span><FileArchive className="ic ic-sm" /> <b>{solution.files.length}</b> tệp · {fmtBytes(solution.bytes)}{solution.kind === 'folder' || solution.files.length > 1 ? ' trước khi nén' : ''}</span>
                    {solution.skipped.length > 0 && <span className="pe-skip" title={solution.skipped.slice(0, 30).map((x) => x.path).join('\n')}>Bỏ qua {solution.skipped.length} mục ({[...new Set(solution.skipped.map((x) => (x.why === 'build' ? 'thư mục build' : x.why === 'blocked' ? 'tệp chạy được' : 'sai loại tệp')))].join(', ')})</span>}
                    <button type="button" className="vec-link" onClick={() => setSolution(null)} disabled={busy}>Bỏ chọn</button>
                  </div>
                  <ul className="pe-tree">
                    {solution.files.slice(0, 7).map((f) => <li key={f.path}><span className="clamp-1 vec-mono">{f.path}</span><small>{fmtBytes(f.file.size)}</small></li>)}
                    {solution.files.length > 7 && <li className="vec-muted">… và {solution.files.length - 7} tệp khác</li>}
                    {!solution.files.length && <li className="vec-err">Không còn tệp nào để nộp sau khi lọc.</li>}
                  </ul>
                  {tooBig && <p className="vec-err">Thư mục rất lớn so với giới hạn {cfg.maxSizeMb} MB, có thể không nộp được.</p>}
                </div>
              )}
              <label className="pe-note">
                <span>Ghi chú cho giám khảo <small>không bắt buộc</small></span>
                <textarea className="textarea" rows={2} maxLength={PE_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} disabled={!canSubmit || busy} placeholder="Ví dụ: câu 3 chạy bằng lệnh npm start" />
                <small className="pe-count">{note.length}/{PE_NOTE_MAX}</small>
              </label>
            </section>

            {/* Step 2 */}
            <section className={cn('pe-step', step2Done && 'is-done')}>
              <header><span className="pe-step-n">{step2Done ? <Check className="ic ic-sm" /> : 2}</span><div><b>Step 2</b><span>Nộp bài</span></div></header>
              <div className="pe-submit-row">
                <Button size="lg" icon={<Send className="ic" />} onClick={submit} loading={busy} disabled={!canSubmit || !solution?.files.length}>{room.submissions.length ? 'Submit again' : 'Submit'}</Button>
                <div className="pe-phase" aria-live="polite">
                  {phase.k === 'pack' && <Progress label="Đang nén thư mục…" p={phase.p} />}
                  {phase.k === 'hash' && <Progress label="Đang tính mã kiểm tra SHA-256…" />}
                  {phase.k === 'upload' && <Progress label={`Đang gửi bài ${Math.round(phase.p * 100)}%`} p={phase.p} />}
                  {phase.k === 'save' && <Progress label="Đang ghi nhận bài nộp…" />}
                  {phase.k === 'ok' && (
                    <div className="pe-success">
                      <CheckCircle2 className="ic" />
                      <span><b>Submit successfully!</b><small>Lần nộp {phase.sub.no} · {fmtStamp(phase.sub.createdAt)} · {fmtBytes(phase.sub.bytes)}</small><small className="vec-mono"><Hash className="ic ic-xs" /> {phase.sub.sha256.slice(0, 16)}…</small></span>
                    </div>
                  )}
                  {phase.k === 'error' && <div className="pe-fail"><CircleAlert className="ic" /><span><b>Chưa nộp được</b><small>{phase.msg}</small></span></div>}
                  {phase.k === 'idle' && <small className="vec-muted">{room.submissions.length ? `Bạn đã nộp ${room.submissions.length} lần. Nộp lại sẽ thêm bản mới; giữ ${cfg.keepVersions} bản gần nhất.` : 'Chọn bài làm ở bước 1 rồi bấm Submit. Có thể nộp lại nhiều lần.'}</small>}
                </div>
              </div>

              <div className="pe-history">
                <div className="pe-history-head">
                  <b>Submit history</b>
                  <label className="pe-check"><input type="checkbox" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} /> The lastest submit only</label>
                </div>
                <div className="vec-tablewrap">
                  <table className="vec-table pe-table">
                    <thead><tr><th>#</th><th>PaperNo</th><th>Path</th><th>Size</th><th>Time</th><th /></tr></thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={h.id} className={cn(i === 0 && !latestOnly && 'is-latest')}>
                          <td>{h.no}</td>
                          <td className="vec-mono">{room.examCode}</td>
                          <td><span className="vec-mono clamp-1" title={h.path}>{h.path}</span><small>{h.fileCount} tệp{h.late ? ' · sát giờ' : ''}{h.note ? ' · có ghi chú' : ''}</small></td>
                          <td>{fmtBytes(h.bytes)}</td>
                          <td className="pe-time">{fmtStamp(h.createdAt)}</td>
                          <td><button type="button" className="btn btn-ghost btn-sm btn-icon" title="Tải lại bản đã nộp để kiểm tra" aria-label={`Tải bản nộp ${h.no}`} onClick={async () => { try { openDownload(await peApi.ownSubmission(a.id, h.id)); } catch (e) { toast.error('Chưa tải được', toApiError(e).message); } }}><Download className="ic ic-sm" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!history.length && <p className="vec-empty pe-empty"><Upload className="ic" /> Chưa có lần nộp nào.</p>}
                </div>
              </div>
            </section>

            {/* Step 3 */}
            <section className="pe-step pe-step-close">
              <header><span className="pe-step-n">3</span><div><b>Step 3</b><span>Ký danh sách và đóng</span></div></header>
              <p className="pe-zero"><TriangleAlert className="ic" /> If you close this window without proctor&apos;s agreement, you will get ZERO.</p>
              <label className="pe-check pe-sign"><input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} /> I have signed the student list and submitted my solution.</label>
              <div className="pe-close-row">
                <Button variant="danger" size="lg" disabled={!signed || busy || (cfg.required && !room.submissions.length && !ended && !timeUp)} onClick={() => setConfirmClose(true)} icon={<Lock className="ic" />}>Close</Button>
                {cfg.required && !room.submissions.length && <small className="vec-muted">Cần nộp bài ít nhất một lần trước khi đóng.</small>}
              </div>
            </section>
          </div>

          <aside className="pe-side">
            <section className="pe-side-card">
              <h3><Info className="ic ic-sm" /> Submit guide</h3>
              {s.instructions ? <p className="pe-pre">{s.instructions}</p> : <p className="vec-muted">Giảng viên không để lại hướng dẫn riêng.</p>}
              <ol className="pe-guide-steps">
                <li>Bấm <b>Show paper</b> để mở đề ở cửa sổ riêng, đặt cạnh IDE.</li>
                {room.materials.length > 0 && <li>Tải <b>given materials</b> về máy và giải nén nếu cần.</li>}
                <li>Làm bài, lưu vào một thư mục rồi bấm <b>Browse folder</b> chọn thư mục đó.</li>
                <li>Bấm <b>Submit</b>. Có thể nộp lại; giám khảo chấm bản mới nhất.</li>
                <li>Hết giờ: ký danh sách thí sinh, tick xác nhận, bấm <b>Close</b>.</li>
              </ol>
            </section>
            <section className="pe-side-card">
              <h3><ShieldCheck className="ic ic-sm" /> Quy định nộp bài</h3>
              <ul className="pe-rules">
                <li><span>Dung lượng</span><b>≤ {cfg.maxSizeMb} MB mỗi lần</b></li>
                <li><span>Hình thức</span><b>{[cfg.allowFolder && 'Thư mục (.zip)', cfg.allowFiles && 'Tệp'].filter(Boolean).join(' hoặc ')}</b></li>
                {cfg.allowFiles && <li><span>Loại tệp</span><b>{cfg.allowedExts.length ? cfg.allowedExts.slice(0, 10).map((x) => `.${x}`).join(' ') + (cfg.allowedExts.length > 10 ? '…' : '') : 'Mọi loại'}</b></li>}
                {cfg.allowFolder && cfg.skipBuildDirs && <li><span>Tự bỏ qua</span><b>bin, obj, node_modules, .git…</b></li>}
                <li><span>Bị chặn</span><b>.exe .bat .msi .ps1…</b></li>
                <li><span>Lưu bản nộp</span><b>{cfg.keepVersions} bản gần nhất</b></li>
              </ul>
            </section>
            <section className="pe-side-card pe-side-paper">
              <h3><Eye className="ic ic-sm" /> Đề thi</h3>
              <ul className="pe-mini-list">{room.paper.map((p) => <li key={p.id}><FormatTag format={p.format} /><span className="clamp-1">{p.name}</span></li>)}</ul>
            </section>
          </aside>
        </div>
      </div>

      <Modal open={materialsOpen} onClose={() => setMaterialsOpen(false)} title="Download given materials" description="Tài liệu giảng viên cho kèm đề. Tải về máy rồi giải nén nếu là tệp .zip." footer={<><Button variant="secondary" onClick={() => setMaterialsOpen(false)}>Đóng</Button><Button icon={<Download className="ic" />} onClick={() => void downloadAll()}>Tải tất cả</Button></>}>
        <ul className="pe-mat-list">
          {room.materials.map((m) => (
            <li key={m.id}>
              <FormatTag format={m.format} />
              <span className="pe-picked-main"><b className="clamp-1">{m.name}</b><small>{m.source === 'LIBRARY' ? 'Từ kho tài liệu' : 'Giảng viên tải lên'}{m.bytes ? ` · ${fmtBytes(m.bytes)}` : ''}</small></span>
              <Button size="sm" variant="secondary" icon={m.format === 'LINK' || m.format === 'GITHUB' ? <ExternalLink className="ic ic-sm" /> : <Download className="ic ic-sm" />} onClick={() => void downloadMaterial(m.id)}>{m.format === 'LINK' || m.format === 'GITHUB' ? 'Mở' : 'Tải về'}</Button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={confirmClose}
        onClose={() => !closing && setConfirmClose(false)}
        title="Đóng phòng thi?"
        description={room.submissions.length ? `Bài nộp mới nhất (lần ${room.submissions[0]!.no}, lúc ${fmtStamp(room.submissions[0]!.createdAt)}) sẽ được chấm. Sau khi đóng bạn không nộp thêm được nữa.` : 'Bạn chưa nộp bài nào. Sau khi đóng sẽ không nộp được nữa.'}
        footer={<><Button variant="secondary" onClick={() => setConfirmClose(false)} disabled={closing}>Quay lại</Button><Button variant="danger" loading={closing} onClick={close} icon={<Lock className="ic" />}>Đóng phòng thi</Button></>}
      />
    </div>
  );
}

function Progress({ label, p }: { label: string; p?: number }) {
  return (
    <div className="pe-progress">
      <small>{label}</small>
      <i className={cn('pe-bar', p == null && 'is-indeterminate')}><i style={p == null ? undefined : { width: `${Math.round(p * 100)}%` }} /></i>
    </div>
  );
}

/* ───────────────────────────── done ───────────────────────────── */

export function PeDone({ a, room }: { a: AttemptStateDto; room: PeRoomDto }) {
  const last = room.submissions[0];
  const s = a.session;
  return (
    <div className="vec-room-page pe-page">
      <div className="pe-lobby">
        <div className="pe-lobby-card pe-done">
          <span className="pe-done-ic"><CheckCircle2 className="ic" /></span>
          <h1>Đã đóng phòng thi</h1>
          <p className="pe-lobby-sub">{s.title} · {s.subjectCode}</p>
          {last ? (
            <div className="pe-receipt">
              <b>Biên nhận bài nộp</b>
              <dl className="pe-kv">
                <div><dt>Paper no</dt><dd className="vec-mono">{room.examCode}</dd></div>
                <div><dt>Lần nộp</dt><dd>{last.no} (mới nhất)</dd></div>
                <div><dt>Thời gian</dt><dd>{fmtStamp(last.createdAt)}</dd></div>
                <div><dt>Bài làm</dt><dd className="vec-mono">{last.path} · {fmtBytes(last.bytes)}</dd></div>
                <div className="is-wide"><dt>SHA-256</dt><dd className="vec-mono pe-sha">{last.sha256}</dd></div>
              </dl>
            </div>
          ) : (
            <p className="vec-err vec-err-block">Bạn không nộp bài nào trong phòng thi này.</p>
          )}
          <GradeCard room={room} />
          <div className="vec-row pe-done-actions">
            <Link to="/app/vec" className="btn btn-primary">Về Phòng thi ảo</Link>
            <Link to="/app/vec/history" className="btn btn-secondary">Lịch sử thi</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GradeCard({ room }: { room: PeRoomDto }) {
  if (!room.grade) return <p className="pe-await"><Clock className="ic ic-sm" /> Giảng viên sẽ chấm bài sau. Điểm và ghi chú hiện ở đây khi được công bố.</p>;
  const g = room.grade;
  return (
    <div className="pe-grade">
      {g.score10 != null && <div className="pe-grade-score"><b>{g.score10.toLocaleString('vi-VN')}</b><small>/ 10</small></div>}
      <div className="pe-grade-main">
        <b>Kết quả chấm</b>
        {g.note ? <p className="pe-pre">{g.note}</p> : <p className="vec-muted">Không có ghi chú.</p>}
        {g.gradedAt && <small className="vec-muted">Chấm lúc {fmtStamp(g.gradedAt)}</small>}
      </div>
    </div>
  );
}
