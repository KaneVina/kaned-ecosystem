import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Plus, Radio, Users } from 'lucide-react';
import { fmtVnDate, fmtVnTime, formatRoomCode, type VecSessionDto } from '@kaned/shared';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { PageHead } from '@/components/ui/Panel';
import { cn } from '@/lib/cn';
import { useHosted } from './api';
import { STATUS } from './HubPage';
import './vec.css';

const TABS = [
  { k: 'live', label: 'Đang diễn ra', test: (s: VecSessionDto) => s.status === 'LIVE' || s.status === 'PAUSED' || s.status === 'LOBBY' },
  { k: 'soon', label: 'Sắp diễn ra', test: (s: VecSessionDto) => s.status === 'SCHEDULED' },
  { k: 'done', label: 'Đã kết thúc', test: (s: VecSessionDto) => s.status === 'ENDED' || s.status === 'CANCELLED' },
] as const;

export default function LecturerPage() {
  const q = useHosted();
  const [tab, setTab] = useState<(typeof TABS)[number]['k']>('live');
  const groups = useMemo(() => Object.fromEntries(TABS.map((t) => [t.k, (q.data ?? []).filter(t.test)])) as Record<string, VecSessionDto[]>, [q.data]);
  // Open on the first tab that has something in it.
  const first = TABS.find((t) => groups[t.k]?.length)?.k;
  const [touched, setTouched] = useState(false);
  const active = touched ? tab : first ?? tab;
  const list = groups[active] ?? [];
  return (
    <>
      <PageHead
        crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Giảng viên' }]}
        title="Phiên thi của tôi"
        description="Tạo phiên mới, đưa mã phòng cho sinh viên và theo dõi ngay khi thi."
        actions={<div className="vec-row"><Link to="/app/vec/lecturer/new/pe" className="btn btn-secondary"><Plus className="ic" /> Phiên thực hành (PE)</Link><Link to="/app/vec/lecturer/new" className="btn btn-primary"><Plus className="ic" /> Phiên trắc nghiệm (FE)</Link></div>}
      />
      <div className="container vec-body">
        <div className="vec-seg vec-seg-lg" role="tablist">
          {TABS.map((t) => (
            <button key={t.k} type="button" role="tab" aria-selected={active === t.k} className={cn(active === t.k && 'is-on')} onClick={() => { setTouched(true); setTab(t.k); }}>
              {t.label} <i>{groups[t.k]?.length ?? 0}</i>
            </button>
          ))}
        </div>
        {q.isLoading ? <Skeleton style={{ height: 180, marginTop: 18 }} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !list.length ? (
          <EmptyState compact title={q.data?.length ? 'Chưa có phiên nào ở mục này' : 'Bạn chưa tạo phiên thi nào'} description="Chọn bộ đề có sẵn hoặc tải file .md để tạo phiên thi đầu tiên." action={<Link to="/app/vec/lecturer/new" className="btn btn-primary"><Plus className="ic" /> Tạo phiên thi</Link>} />
        ) : (
          <ul className="vec-sessions">
            {list.map((s) => (
              <li key={s.id}>
                <Link to={`/app/vec/lecturer/${s.id}`} className="vec-srow">
                  <div className="vec-sroom"><small>Mã phòng</small><b>{formatRoomCode(s.roomCode)}</b></div>
                  <div className="vec-smain">
                    <b>{s.title}</b>
                    <span>{s.kind === 'PE' ? <><b className="pe-kind-tag">PE</b> {s.subjectCode} · {s.pe?.examCode} · {s.durationMin} phút</> : <>{s.subjectCode} · {s.questionCount} câu · {s.durationMin} phút</>}</span>
                    <span><CalendarClock className="ic ic-sm" /> {fmtVnTime(s.startsAt)}, {fmtVnDate(s.startsAt)}</span>
                  </div>
                  <div className="vec-sside">
                    <Badge tone={s.status === 'LIVE' ? 'green' : s.status === 'PAUSED' ? 'amber' : s.status === 'ENDED' || s.status === 'CANCELLED' ? 'gray' : 'violet'}>
                      {s.status === 'LIVE' && <Radio className="ic ic-xs" />} {STATUS[s.status]}
                    </Badge>
                    <span className="vec-muted"><Users className="ic ic-sm" /> {s.counts.joined}{s.counts.suspended ? ` · ${s.counts.suspended} bị khóa` : ''}{s.counts.pendingRequests ? ` · ${s.counts.pendingRequests} yêu cầu` : ''}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
