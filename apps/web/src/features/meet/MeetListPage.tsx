import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, CalendarClock, Copy, ExternalLink, PencilLine, Plus, Trash2, Users } from 'lucide-react';
import { dayLabel, fmtDur, fmtMin, type MeetListItem } from '@kaned/shared';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { PageHead } from '@/components/ui/Panel';
import { ToolArt } from '@/components/illustrations/ToolArt';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtRelative } from '@/lib/format';
import { useToast } from '@/providers/ToastProvider';
import { meetApi, meetLink } from './api';
import { daysSummary, hoursSummary } from './model';
import './meet.css';

/** The leader's events: open ones first, each with its link and how many have answered. */
export default function MeetListPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meet', 'mine'], queryFn: meetApi.mine });
  const [del, setDel] = useState<MeetListItem | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => meetApi.remove(id),
    onSuccess: () => {
      toast.success('Đã xoá sự kiện');
      setDel(null);
      void qc.invalidateQueries({ queryKey: ['meet', 'mine'] });
    },
    onError: (e) => toast.error(toApiError(e).message),
  });
  const copy = async (slug: string) => {
    await navigator.clipboard?.writeText(meetLink(slug)).catch(() => undefined);
    toast.success('Đã chép link', meetLink(slug));
  };
  const list = q.data ?? [];

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Công cụ' }, { label: 'Hẹn họp nhóm' }]}
        title="Hẹn họp nhóm"
        description="Tạo một sự kiện, gửi link cho nhóm. Mọi người tô giờ rảnh không cần tài khoản, Kaned tìm giờ nhiều người rảnh nhất để bạn chốt."
        actions={<Link className="btn btn-primary" to="/app/tools/meet/new"><Plus className="ic ic-sm" /> Tạo sự kiện</Link>}
      />
      <div className="container mt-body">
        {q.isLoading ? (
          <div className="mt-list">{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 168, borderRadius: 16 }} />)}</div>
        ) : q.isError ? (
          <ErrorState description={toApiError(q.error).message} onRetry={() => q.refetch()} />
        ) : !list.length ? (
          <div className="mt-intro">
            <ToolArt name="meet" className="mt-intro-art" />
            <div>
              <h2>Hết cảnh hỏi “mọi người rảnh lúc nào?” trong nhóm chat</h2>
              <ol>
                <li><b>Tạo sự kiện</b><span>Chọn các ngày, khung giờ có thể họp, chặn sẵn giờ học.</span></li>
                <li><b>Gửi link</b><span>Thành viên chỉ nhập tên rồi kéo tay tô giờ rảnh.</span></li>
                <li><b>Chốt một chạm</b><span>Lịch nhóm cập nhật trực tiếp, Kaned đề xuất giờ tốt nhất.</span></li>
              </ol>
              <Link className="btn btn-primary btn-lg" to="/app/tools/meet/new"><Plus className="ic" /> Tạo sự kiện đầu tiên</Link>
            </div>
          </div>
        ) : (
          <ul className="mt-list">
            {list.map((e) => (
              <li key={e.id} className={cn('mt-item', e.status === 'FINAL' && 'is-final')}>
                <Link to={`/m/${e.slug}`} className="mt-item-main">
                  <span className={cn('mt-status', e.status === 'FINAL' ? 'is-final' : 'is-open')}>
                    {e.status === 'FINAL' ? <><CalendarCheck2 className="ic ic-xs" /> Đã chốt</> : <><span className="mt-status-dot" /> Đang lấy giờ rảnh</>}
                  </span>
                  <h3>{e.title}</h3>
                  {e.final ? (
                    <p className="mt-item-final">{dayLabel(e.final.day).long}{dayLabel(e.final.day).date ? ` ${dayLabel(e.final.day).date}` : ''} · {fmtMin(e.final.start)}–{fmtMin(e.final.end)}</p>
                  ) : (
                    <p>{daysSummary(e.days)} · {hoursSummary(e.days)} · {fmtDur(e.durationMin)}</p>
                  )}
                  <div className="mt-item-meta">
                    <span><Users className="ic ic-xs" /> {e.responded}/{e.participants} đã tô</span>
                    <span>Cập nhật {fmtRelative(new Date(e.updatedAt).toISOString())}</span>
                  </div>
                  {e.participants > 0 && <div className="mt-item-bar"><span style={{ width: `${(e.responded / Math.max(1, e.participants)) * 100}%` }} /></div>}
                </Link>
                <div className="mt-item-act">
                  <Button size="sm" variant="secondary" icon={<Copy className="ic ic-sm" />} onClick={() => copy(e.slug)}>Chép link</Button>
                  <Link className="btn btn-ghost btn-sm btn-icon" to={`/m/${e.slug}`} aria-label="Mở" title="Mở trang sự kiện"><ExternalLink className="ic ic-sm" /></Link>
                  <Link className="btn btn-ghost btn-sm btn-icon" to={`/app/tools/meet/${e.id}/edit`} aria-label="Sửa" title="Sửa"><PencilLine className="ic ic-sm" /></Link>
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setDel(e)} aria-label="Xoá" title="Xoá"><Trash2 className="ic ic-sm" /></button>
                </div>
              </li>
            ))}
            <li>
              <Link to="/app/tools/meet/new" className="mt-item-new"><CalendarClock className="ic" /> Tạo sự kiện mới</Link>
            </li>
          </ul>
        )}
      </div>
      <Modal
        open={Boolean(del)}
        onClose={() => !remove.isPending && setDel(null)}
        title={`Xoá "${del?.title ?? ''}"?`}
        description="Link sẽ ngừng hoạt động và lịch mọi người đã tô bị xoá. Không thể hoàn tác."
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setDel(null)}>Huỷ</Button><Button variant="danger" loading={remove.isPending} onClick={() => del && remove.mutate(del.id)}>Xoá sự kiện</Button></>}
      />
    </>
  );
}
