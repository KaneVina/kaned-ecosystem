import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenText, Check, ChevronDown, Download, FileDown, Hash, MessageSquareText, Search, Trash2, Upload } from 'lucide-react';
import { fmtBytes, foldVi, fmtVnFull, peFormatOf, type PeGradeRow, type VecSessionDto } from '@kaned/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { http, toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import { csvUrl } from '../api';
import { FormatTag } from './ItemPicker';
import { openDownload, peApi, peKeys } from './peApi';
import { fmtStamp } from './PeRoom';
import './pe.css';

const STATE: Record<string, [string, 'green' | 'amber' | 'blue' | 'gray' | 'red']> = {
  LOBBY: ['Phòng chờ', 'amber'], IN_PROGRESS: ['Đang làm', 'green'], SUSPENDED: ['Bị khóa', 'red'], SUBMITTED: ['Đã đóng', 'blue'], AUTO_SUBMITTED: ['Hết giờ', 'blue'], FORCE_SUBMITTED: ['Bị thu bài', 'blue'], VOIDED: ['Đã hủy', 'gray'],
};

/** PE results: every candidate's submissions, downloads, and a score and note per candidate. */
export function PeGrading({ s }: { s: VecSessionDto }) {
  const toast = useToast();
  const q = useQuery({ queryKey: peKeys.grading(s.id), queryFn: () => peApi.grading(s.id), refetchInterval: s.status === 'LIVE' ? 10_000 : 30_000, staleTime: 3000 });
  const [filter, setFilter] = useState<'all' | 'none' | 'todo' | 'done'>('all');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');

  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const counts = useMemo(() => ({
    all: rows.length,
    none: rows.filter((r) => !r.submissions.length).length,
    todo: rows.filter((r) => r.submissions.length && r.gradedAt == null).length,
    done: rows.filter((r) => r.gradedAt != null).length,
  }), [rows]);
  const list = useMemo(() => {
    const k = foldVi(text.trim());
    return rows
      .filter((r) => (filter === 'all' ? true : filter === 'none' ? !r.submissions.length : filter === 'todo' ? r.submissions.length && r.gradedAt == null : r.gradedAt != null))
      .filter((r) => !k || foldVi(`${r.fullName} ${r.studentCode} ${r.email} ${r.className}`).includes(k));
  }, [rows, filter, text]);

  if (q.isLoading) return <Skeleton style={{ height: 300 }} />;
  if (q.isError || !q.data) return <ErrorState description={(q.error as Error | null)?.message} onRetry={() => q.refetch()} />;
  const g = q.data;

  const exportCsv = async () => {
    setBusy('csv');
    try {
      const r = await http.get(csvUrl(s.id).replace(/^\/api/, ''), { responseType: 'blob' });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bang-diem-${g.examCode}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Chưa xuất được', toApiError(e).message);
    } finally {
      setBusy('');
    }
  };
  const downloadAll = async () => {
    setBusy('all');
    try {
      const files = await peApi.latest(s.id);
      if (!files.length) return toast.info('Chưa có bài nộp nào');
      toast.success(`Đang tải ${files.length} bài`, 'Trình duyệt có thể hỏi cho phép tải nhiều tệp, hãy chọn Cho phép.');
      for (const f of files) {
        openDownload({ url: f.url, name: `${f.studentCode || f.fullName}_${f.name}`, kind: 'download' });
        await new Promise((r) => setTimeout(r, 650));
      }
    } catch (e) {
      toast.error('Chưa tải được', toApiError(e).message);
    } finally {
      setBusy('');
    }
  };
  const openPaper = () => window.open(`/vec/paper/host/${s.id}`, `kaned-pe-host-${s.id}`, 'popup=yes,width=1120,height=880');

  return (
    <div className="pe-grading">
      <div className="vec-kpis">
        <div className="vec-kpi"><b>{g.totals.candidates}</b><span>Thí sinh</span></div>
        <div className="vec-kpi is-green"><b>{g.totals.submitted}</b><span>Đã nộp bài</span></div>
        <div className={cn('vec-kpi', counts.todo && 'is-amber')}><b>{counts.todo}</b><span>Chờ chấm</span></div>
        <div className="vec-kpi"><b>{g.totals.graded}</b><span>Đã chấm</span></div>
        <div className="vec-kpi"><b>{fmtBytes(g.totals.bytes)}</b><span>Dung lượng bài nộp</span></div>
      </div>
      {g.retentionUntil && (
        <p className="pe-retention"><Trash2 className="ic ic-sm" /> <span>Bài nộp và tệp của phiên tự xóa lúc <b>{fmtVnFull(g.retentionUntil)}</b>. Tải bài về và xuất bảng điểm trước thời điểm này.</span></p>
      )}

      <section className="vec-card">
        <div className="vec-mon-tools pe-grade-tools">
          <div className="vec-seg" role="tablist">
            {([['all', 'Tất cả'], ['none', 'Chưa nộp'], ['todo', 'Chờ chấm'], ['done', 'Đã chấm']] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} className={cn(filter === k && 'is-on')} onClick={() => setFilter(k)}>{l} <i>{counts[k]}</i></button>
            ))}
          </div>
          <Input icon={<Search className="ic" />} sizeVariant="sm" placeholder="Tìm tên, mã SV, lớp" value={text} onChange={(e) => setText(e.target.value)} />
          <span className="spacer" />
          <Button variant="ghost" size="sm" icon={<BookOpenText className="ic ic-sm" />} onClick={openPaper}>Xem đề</Button>
          <Button variant="secondary" size="sm" icon={<Download className="ic ic-sm" />} loading={busy === 'all'} onClick={downloadAll} disabled={!g.totals.submitted}>Tải tất cả bài mới nhất</Button>
          <Button variant="secondary" size="sm" icon={<FileDown className="ic ic-sm" />} loading={busy === 'csv'} onClick={exportCsv}>Xuất CSV</Button>
        </div>
        {!rows.length ? (
          <p className="vec-empty"><Upload className="ic ic-lg" />Chưa có thí sinh nào vào phòng.</p>
        ) : (
          <ul className="pe-grade-list">
            {list.map((r) => <GradeRow key={r.attemptId} r={r} sessionId={s.id} />)}
            {!list.length && <li className="vec-empty">Không có thí sinh nào khớp bộ lọc.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}

function GradeRow({ r, sessionId }: { r: PeGradeRow; sessionId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [score, setScore] = useState(r.score10 == null ? '' : String(r.score10));
  const [note, setNote] = useState(r.note ?? '');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    setScore(r.score10 == null ? '' : String(r.score10));
    setNote(r.note ?? '');
    // Only when the server copy changes (someone saved), not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.gradedAt]);
  const last = r.submissions[0];
  const parsed = score.trim() === '' ? null : Number(score.replace(',', '.'));
  const scoreErr = parsed != null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 10 || Math.round(parsed * 4) !== parsed * 4) ? 'Điểm 0–10, bước 0,25' : '';
  const dirty = (parsed ?? null) !== (r.score10 ?? null) || note.trim() !== (r.note ?? '');
  const [st, tone] = STATE[r.state] ?? [r.state, 'gray'];

  const save = async () => {
    if (scoreErr || !dirty) return;
    setSaving(true);
    try {
      await peApi.grade(r.attemptId, parsed, note.trim() || null);
      await qc.invalidateQueries({ queryKey: peKeys.grading(sessionId) });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
    } catch (e) {
      toast.error('Chưa lưu được điểm', toApiError(e).message);
    } finally {
      setSaving(false);
    }
  };
  const dl = async (submissionId: string, label: string) => {
    try {
      const link = await peApi.submissionLink(submissionId);
      openDownload({ ...link, name: `${r.studentCode || r.fullName}_${label}` });
    } catch (e) {
      toast.error('Chưa tải được', toApiError(e).message);
    }
  };

  return (
    <li className={cn('pe-grow', r.gradedAt != null && 'is-graded', !r.submissions.length && 'is-empty')}>
      <div className="pe-grow-who">
        <span className="vec-avatar">{(r.fullName || '?').split(' ').slice(-1)[0]!.slice(0, 2).toUpperCase()}</span>
        <div>
          <b>{r.fullName}</b>
          <small>{[r.studentCode, r.className].filter(Boolean).join(' · ') || r.email}</small>
          <Badge tone={tone}>{st}</Badge>
        </div>
      </div>

      <div className="pe-grow-sub">
        {last ? (
          <>
            <div className="pe-grow-file">
              <FormatTag format={peFormatOf(last.fileName)} />
              <span className="pe-grow-main"><b className="clamp-1 vec-mono" title={last.path}>{last.path}</b><small>{fmtBytes(last.bytes)} · {last.fileCount} tệp · {fmtStamp(last.createdAt)}{last.late ? ' · sát giờ' : ''}</small></span>
              <Button size="sm" variant="secondary" icon={<Download className="ic ic-sm" />} onClick={() => void dl(last.id, last.fileName)}>Tải</Button>
            </div>
            {last.note && <p className="pe-grow-note"><MessageSquareText className="ic ic-xs" /> {last.note}</p>}
            {r.submissions.length > 1 && (
              <button type="button" className={cn('pe-grow-more', open && 'is-open')} onClick={() => setOpen(!open)} aria-expanded={open}>
                <ChevronDown className="ic ic-xs" /> {r.submissions.length - 1} lần nộp trước
              </button>
            )}
            {open && (
              <ul className="pe-grow-versions">
                {r.submissions.slice(1).map((h) => (
                  <li key={h.id}>
                    <span>Lần {h.no}</span>
                    <span className="vec-mono clamp-1">{h.path}</span>
                    <small>{fmtBytes(h.bytes)} · {fmtStamp(h.createdAt)}</small>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Tải lần nộp ${h.no}`} onClick={() => void dl(h.id, `lan${h.no}_${h.fileName}`)}><Download className="ic ic-sm" /></button>
                  </li>
                ))}
              </ul>
            )}
            <small className="pe-grow-sha" title={last.sha256}><Hash className="ic ic-xs" /> {last.sha256.slice(0, 20)}…</small>
          </>
        ) : (
          <p className="vec-muted pe-grow-none">{r.state === 'LOBBY' ? 'Chưa bắt đầu làm bài' : 'Chưa nộp bài'}</p>
        )}
      </div>

      <div className="pe-grow-grade">
        <label className={cn('pe-score', scoreErr && 'is-bad')}>
          <span>Điểm</span>
          <input
            inputMode="decimal"
            value={score}
            placeholder="—"
            onChange={(e) => setScore(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            aria-invalid={Boolean(scoreErr)}
            disabled={r.state === 'LOBBY'}
          />
          <small>/10</small>
        </label>
        <div className="pe-steps-btns" aria-hidden={r.state === 'LOBBY'}>
          {[-0.25, 0.25].map((d) => (
            <button key={d} type="button" disabled={r.state === 'LOBBY'} onClick={() => setScore((v) => String(Math.max(0, Math.min(10, Math.round(((Number(v.replace(',', '.')) || 0) + d) * 4) / 4))))}>{d > 0 ? '+' : '−'}0,25</button>
          ))}
        </div>
        <textarea className="textarea pe-grade-note" rows={2} maxLength={1000} placeholder="Ghi chú cho sinh viên" value={note} onChange={(e) => setNote(e.target.value)} disabled={r.state === 'LOBBY'} />
        {scoreErr && <small className="vec-err">{scoreErr}</small>}
        <div className="pe-grade-save">
          <Button size="sm" loading={saving} disabled={!dirty || Boolean(scoreErr) || r.state === 'LOBBY'} onClick={save} icon={justSaved ? <Check className="ic ic-sm" /> : undefined}>{justSaved ? 'Đã lưu' : 'Lưu'}</Button>
          {r.gradedAt && !dirty && <small className="vec-muted">Chấm {fmtStamp(r.gradedAt)}{r.gradedBy ? ` · ${r.gradedBy}` : ''}</small>}
          {dirty && <small className="pe-dirty">Chưa lưu</small>}
        </div>
      </div>
    </li>
  );
}
