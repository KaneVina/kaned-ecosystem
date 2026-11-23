import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, Clock, Eye, EyeOff, RotateCcw, Send, XCircle } from 'lucide-react';
import { RETAKE_BLOCK_TEXT, RETAKE_SCORING_LABEL, fmtDuration, fmtVnFull, type AttemptResultDto } from '@kaned/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHead } from '@/components/ui/Panel';
import { QText, Inline } from '@/features/decks/parts';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useToast } from '@/providers/ToastProvider';
import { useServerTick } from './hooks';
import { useAttemptResult, vec, vecKeys } from './api';
import './vec.css';

const LETTERS = 'ABCDEFGH';

export default function ResultPage() {
  const { attemptId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  useServerTick(30_000);
  const q = useAttemptResult(attemptId);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState<'all' | 'wrong'>('all');

  if (q.isLoading) return <div className="container vec-body"><Skeleton style={{ height: 280 }} /></div>;
  if (q.isError || !q.data) return <div className="container vec-body"><ErrorState description={(q.error as Error | null)?.message} onRetry={() => q.refetch()} /></div>;
  const r = q.data;

  const retake = async () => {
    setBusy(true);
    try {
      const x = await vec.retake(r.attemptId);
      nav(`/app/vec/room/${x.attemptId}`);
    } catch (e) {
      toast.error('Chưa làm lại được', toApiError(e).message);
      void qc.invalidateQueries({ queryKey: vecKeys.result(r.attemptId) });
    } finally {
      setBusy(false);
    }
  };
  const sendRequest = async () => {
    setBusy(true);
    try {
      await vec.request(r.attemptId, 'RETAKE', note.trim());
      toast.success('Đã gửi yêu cầu', 'Giảng viên sẽ duyệt, trang này tự cập nhật.');
      setAsk(false);
      void q.refetch();
    } catch (e) {
      toast.error('Chưa gửi được', toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const items = r.review?.filter((x) => filter === 'all' || x.verdict === 'WRONG') ?? [];
  return (
    <>
      <PageHead crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Kết quả' }]} title={r.title} description={`Lượt ${r.attemptNo}/${r.maxAttempts} · Mã đề ${r.paperCode}${r.submittedAt ? ` · nộp lúc ${fmtVnFull(r.submittedAt)}` : ''}`} />
      <div className="container vec-body">
        <div className="vec-res-grid">
          <section className="vec-card vec-score">
            {r.score ? (
              <>
                <div className={cn('vec-ring', r.score.passed ? 'is-pass' : 'is-fail')} style={{ ['--p' as string]: `${(r.score.score10 / 10) * 100}%` }}>
                  <b>{r.score.score10.toFixed(2).replace(/\.?0+$/, '')}</b><small>/ 10</small>
                </div>
                <Badge tone={r.score.passed ? 'green' : 'red'}>{r.score.label}</Badge>
                {(r.state === 'AUTO_SUBMITTED' || r.state === 'FORCE_SUBMITTED') && <p className="vec-muted">{r.state === 'AUTO_SUBMITTED' ? 'Hệ thống tự nộp khi hết giờ.' : 'Giảng viên đã thu bài.'}</p>}
                <ul className="vec-tally">
                  <li className="ok"><CheckCircle2 className="ic" /> {r.score.correct} đúng</li>
                  <li className="bad"><XCircle className="ic" /> {r.score.wrong} sai</li>
                  <li><CircleAlert className="ic" /> {r.score.blank} bỏ trống</li>
                  {r.score.durationSec != null && <li><Clock className="ic" /> {fmtDuration(r.score.durationSec)}</li>}
                </ul>
              </>
            ) : (
              <div className="vec-hidden">
                <EyeOff className="ic ic-lg" />
                <h2>Bài đã được nộp</h2>
                <p>Giảng viên chưa công bố điểm. Kết quả sẽ hiện ở đây khi được công bố, trang này tự cập nhật.</p>
              </div>
            )}
          </section>

          <section className="vec-card">
            <h2>Các lượt làm bài</h2>
            <table className="vec-table">
              <thead><tr><th>Lượt</th><th>Trạng thái</th><th>Điểm</th><th /></tr></thead>
              <tbody>
                {r.attempts.map((x) => (
                  <tr key={x.id} className={cn(x.id === r.attemptId && 'is-me')}>
                    <td>#{x.attemptNo}</td>
                    <td>{STATE_TEXT[x.state]}</td>
                    <td>{x.score10 != null ? x.score10 : <span className="vec-muted">—</span>}</td>
                    <td>{x.id !== r.attemptId && <Link to={`/app/vec/result/${x.id}`}>Xem</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.counted && (
              <p className="vec-counted">Điểm tính cho môn: <b>{r.counted.score10}</b> <span className="vec-muted">({RETAKE_SCORING_LABEL[r.counted.how]}{r.counted.attemptNo ? `, lượt #${r.counted.attemptNo}` : ''})</span></p>
            )}
            <RetakeBox r={r} busy={busy} onRetake={retake} onAsk={() => setAsk(true)} />
          </section>
        </div>

        {r.review ? (
          <section className="vec-review">
            <div className="vec-review-head">
              <h2><Eye className="ic" /> Xem lại bài làm</h2>
              {r.canSeeRightWrong && (
                <div className="vec-seg">
                  <button type="button" className={cn(filter === 'all' && 'is-on')} onClick={() => setFilter('all')}>Tất cả</button>
                  <button type="button" className={cn(filter === 'wrong' && 'is-on')} onClick={() => setFilter('wrong')}>Câu sai</button>
                </div>
              )}
            </div>
            {!r.canSeeAnswers && <p className="vec-muted">Đáp án đúng sẽ hiện khi giảng viên cho phép (thường là sau khi phiên kết thúc).</p>}
            {items.map((x) => {
              const idx = r.review!.indexOf(x);
              return (
                <article key={x.qid} className={cn('vec-rq', x.verdict && `is-${x.verdict.toLowerCase()}`)}>
                  <header><b>Câu {idx + 1}</b>{x.verdict && <Badge tone={x.verdict === 'RIGHT' ? 'green' : x.verdict === 'WRONG' ? 'red' : 'gray'}>{x.verdict === 'RIGHT' ? 'Đúng' : x.verdict === 'WRONG' ? 'Sai' : 'Bỏ trống'}</Badge>}</header>
                  <QText text={x.text} small as="h3" />
                  <ul>
                    {x.options.map((o, i) => (
                      <li key={o.oid} className={cn(o.chosen && 'is-chosen', o.correct && 'is-correct', o.chosen && o.correct === false && 'is-wrong')}>
                        <span className="vec-letter">{LETTERS[i]}</span><Inline text={o.text} />
                        {o.chosen && <em>Bạn chọn</em>}
                        {o.correct && <em className="ok">Đáp án đúng</em>}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>
        ) : r.canSeeScore ? (
          <p className="vec-muted vec-foot">Chi tiết từng câu được công bố sau, theo thiết lập của giảng viên.</p>
        ) : null}
        <p className="vec-foot"><Link to="/app/vec/history">Lịch sử thi</Link> · <Link to="/app/vec">Về Phòng thi ảo</Link></p>
      </div>
      <Modal open={ask} onClose={() => setAsk(false)} title="Xin giảng viên cho làm lại" size="sm" footer={<><Button variant="secondary" onClick={() => setAsk(false)}>Hủy</Button><Button loading={busy} onClick={sendRequest} icon={<Send className="ic" />}>Gửi yêu cầu</Button></>}>
        <Field label="Lý do (không bắt buộc)"><textarea className="input" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </>
  );
}

const STATE_TEXT: Record<string, string> = {
  SUBMITTED: 'Đã nộp', AUTO_SUBMITTED: 'Tự nộp (hết giờ)', FORCE_SUBMITTED: 'Giảng viên thu bài', VOIDED: 'Đã hủy', IN_PROGRESS: 'Đang làm', SUSPENDED: 'Bị khóa', LOBBY: 'Chờ bắt đầu',
};

function RetakeBox({ r, busy, onRetake, onAsk }: { r: AttemptResultDto; busy: boolean; onRetake: () => void; onAsk: () => void }) {
  const { retake } = r;
  if (r.sessionStatus === 'ENDED' && !retake.ok) return <p className="vec-muted vec-retake">Phiên thi đã kết thúc.</p>;
  if (retake.quota === 0 && retake.mode !== 'LECTURER_ONLY') return <p className="vec-muted vec-retake">Phiên này không cho làm lại.</p>;
  return (
    <div className="vec-retake">
      <p><b>Làm lại:</b> đã dùng {retake.used}/{retake.quota} lượt.</p>
      {retake.ok ? (
        <Button onClick={onRetake} loading={busy} icon={<RotateCcw className="ic" />}>Làm lại ngay</Button>
      ) : retake.reason === 'NEEDS_APPROVAL' ? (
        retake.requested ? <p className="vec-ok">Đã gửi yêu cầu, đang chờ giảng viên duyệt…</p> : <Button variant="secondary" onClick={onAsk} icon={<Send className="ic" />}>Xin giảng viên cho làm lại</Button>
      ) : (
        <p className="vec-muted">{retake.reason ? RETAKE_BLOCK_TEXT[retake.reason] : ''}</p>
      )}
    </div>
  );
}
