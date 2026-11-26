import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, Hash } from 'lucide-react';
import { fmtBytes, type AttemptStateDto } from '@kaned/shared';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { PageHead } from '@/components/ui/Panel';
import { toApiError } from '@/lib/api';
import { useToast } from '@/providers/ToastProvider';
import { openDownload, peApi, peKeys } from './peApi';
import { GradeCard, fmtStamp } from './PeRoom';
import './pe.css';

/** A candidate's PE result: what they handed in, and the lecturer's score and note once shown. */
export function PeResult({ a }: { a: AttemptStateDto }) {
  const toast = useToast();
  const q = useQuery({ queryKey: peKeys.room(a.id), queryFn: () => peApi.room(a.id), staleTime: 0 });
  const s = a.session;
  return (
    <>
      <PageHead crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Lịch sử thi', to: '/app/vec/history' }, { label: s.title }]} title={s.title} description={`${s.subjectCode} · ${s.subjectName} · Thi thực hành`} />
      <div className="container vec-body">
        {q.isLoading ? <Skeleton style={{ height: 240 }} /> : q.isError || !q.data ? <ErrorState description={(q.error as Error | null)?.message} onRetry={() => q.refetch()} /> : (
          <div className="pe-result">
            <GradeCard room={q.data} />
            <section className="vec-card">
              <h2><CheckCircle2 className="ic" /> Bài đã nộp · Paper {q.data.examCode}</h2>
              {!q.data.submissions.length ? <p className="vec-muted">Bạn không nộp bài nào trong phòng thi này.</p> : (
                <div className="vec-tablewrap">
                  <table className="vec-table pe-table">
                    <thead><tr><th>#</th><th>Path</th><th>Size</th><th>Time</th><th>SHA-256</th><th /></tr></thead>
                    <tbody>
                      {q.data.submissions.map((h, i) => (
                        <tr key={h.id} className={i === 0 ? 'is-latest' : undefined}>
                          <td>{h.no}{i === 0 && <small>mới nhất</small>}</td>
                          <td><span className="vec-mono clamp-1">{h.path}</span><small>{h.fileCount} tệp{h.late ? ' · sát giờ' : ''}</small></td>
                          <td>{fmtBytes(h.bytes)}</td>
                          <td className="pe-time">{fmtStamp(h.createdAt)}</td>
                          <td className="vec-mono pe-time" title={h.sha256}><Hash className="ic ic-xs" /> {h.sha256.slice(0, 12)}…</td>
                          <td><button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Tải bản nộp ${h.no}`} onClick={async () => { try { openDownload(await peApi.ownSubmission(a.id, h.id)); } catch (e) { toast.error('Chưa tải được', toApiError(e).message); } }}><Download className="ic ic-sm" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="vec-fine">Bài nộp được giữ 7 ngày sau khi phiên thi kết thúc rồi tự xóa.</p>
            </section>
            <div className="vec-row"><Link to="/app/vec" className="btn btn-secondary">Về Phòng thi ảo</Link></div>
          </div>
        )}
      </div>
    </>
  );
}
