import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fmtVnDate, fmtVnTime, formatRoomCode, type HistoryItemDto } from '@kaned/shared';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { PageHead } from '@/components/ui/Panel';
import { cn } from '@/lib/cn';
import { vec, vecKeys } from './api';
import './vec.css';

export default function HistoryPage() {
  const [tab, setTab] = useState<'taken' | 'hosted'>('taken');
  const taken = useQuery({ queryKey: vecKeys.taken, queryFn: vec.takenHistory });
  const hosted = useQuery({ queryKey: vecKeys.hostedHistory, queryFn: vec.hostedHistory });
  const q = tab === 'taken' ? taken : hosted;
  return (
    <>
      <PageHead crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Lịch sử' }]} title="Lịch sử thi" description="Các phiên bạn đã thi và các phiên bạn đã tổ chức. Phiên được lưu 180 ngày sau khi kết thúc." />
      <div className="container vec-body">
        <div className="vec-seg vec-seg-lg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'taken'} className={cn(tab === 'taken' && 'is-on')} onClick={() => setTab('taken')}>Tôi đã thi</button>
          <button type="button" role="tab" aria-selected={tab === 'hosted'} className={cn(tab === 'hosted' && 'is-on')} onClick={() => setTab('hosted')}>Tôi đã tổ chức</button>
        </div>
        {q.isLoading ? <Skeleton style={{ height: 160, marginTop: 18 }} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? (
          <EmptyState compact title={tab === 'taken' ? 'Bạn chưa thi phiên nào' : 'Chưa có phiên nào kết thúc'} description={tab === 'taken' ? 'Nhập mã phòng của giảng viên để vào thi.' : 'Phiên đã kết thúc sẽ hiện ở đây cùng thống kê.'} action={<Link to={tab === 'taken' ? '/app/vec/student' : '/app/vec/lecturer/new'} className="btn btn-primary">{tab === 'taken' ? 'Vào phòng thi' : 'Tạo phiên thi'}</Link>} />
        ) : (
          <ul className="vec-hist">
            {q.data.map((h) => <Row key={h.id} h={h} tab={tab} />)}
          </ul>
        )}
      </div>
    </>
  );
}

function Row({ h, tab }: { h: HistoryItemDto; tab: 'taken' | 'hosted' }) {
  const to = tab === 'taken' ? `/app/vec/result/${h.attemptId}` : `/app/vec/lecturer/${h.sessionId}/results`;
  return (
    <li>
      <Link to={to} className="vec-hrow">
        <div className="vec-hmain">
          <b>{h.title}</b>
          <span>{h.subjectCode} · {fmtVnTime(h.startsAt)}, {fmtVnDate(h.startsAt)}{h.roomCode ? ` · phòng ${formatRoomCode(h.roomCode)}` : ''}</span>
        </div>
        <div className="vec-hside">
          {tab === 'taken' ? (
            h.scoreVisible && h.countedScore != null ? <span className="vec-score-pill">{h.countedScore}</span> : <Badge tone="gray">Chưa công bố</Badge>
          ) : (
            <><span>{h.candidates ?? 0} thí sinh</span><span>{h.avg != null ? `TB ${h.avg}` : '—'}</span></>
          )}
          <Badge tone={h.status === 'ENDED' ? 'gray' : h.status === 'CANCELLED' ? 'red' : 'green'}>{h.status === 'ENDED' ? 'Đã kết thúc' : h.status === 'CANCELLED' ? 'Đã hủy' : 'Đang mở'}</Badge>
        </div>
      </Link>
    </li>
  );
}
