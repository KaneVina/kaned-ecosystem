import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Clock,
  FilePlus2,
  Files,
  History,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS, type ActivityDto, type DocumentStatus } from '@kaned/shared';
import { FileBadge } from '@/components/ui/FileBadge';
import { EmptyState } from '@/components/ui/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtInt, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useOverview, useUpdateDocumentAdmin } from './api';
import { AdminHead, StatCard, Swatch } from './ui';
import { useAdminCrumbs } from './AdminShell';

const STATUS_COLOR: Record<DocumentStatus, string> = {
  PUBLISHED: '#17865B',
  PENDING: '#E7A033',
  REJECTED: '#CF3A31',
  REMOVED: '#8E8AA3',
};

const ACTION_ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  create: { icon: Plus, tone: 'green' },
  update: { icon: Pencil, tone: 'blue' },
  move: { icon: RouteIcon, tone: 'blue' },
  delete: { icon: Trash2, tone: 'red' },
  publish: { icon: Check, tone: 'green' },
  reject: { icon: X, tone: 'red' },
  remove: { icon: X, tone: 'amber' },
  role: { icon: UserCog, tone: 'violet' },
};

export function ActivityLine({ a }: { a: ActivityDto }) {
  const meta = ACTION_ICON[a.action] ?? ACTION_ICON.update;
  return (
    <li>
      <span className={cn('feed-ic', `tone-${meta.tone}`)}>
        <meta.icon className="ic" />
      </span>
      <div>
        <p>
          <b>{a.actor?.name ?? 'Hệ thống'}</b> · {a.summary}
        </p>
        <time dateTime={a.createdAt}>{timeAgo(a.createdAt)}</time>
      </div>
    </li>
  );
}

/** Documents created per week, one series, so no legend: the panel title names it. */
function WeeklyChart({ weeks }: { weeks: Array<{ weekStart: string; count: number }> }) {
  const max = Math.max(...weeks.map((w) => w.count));
  // Round the axis up to a clean number so ticks read 0 / 5 / 10 rather than 0 / 3.5 / 7.
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const label = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  };
  const latest = weeks.length - 1;

  return (
    <div className="wk-chart" role="img" aria-label={`Tài liệu mới mỗi tuần: ${weeks.map((w) => `${label(w.weekStart)} ${w.count}`).join(', ')}`}>
      <div className="wk-axis" aria-hidden>
        {ticks.map((t) => (
          <span key={t} style={{ bottom: `calc(22px + (100% - 22px) * ${t / top})` }}>
            {fmtInt(t)}
          </span>
        ))}
      </div>
      <div className="wk-plot">
        {ticks.slice(1).map((t) => (
          <span key={t} className="wk-grid" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
        ))}
        {weeks.map((w, i) => (
          <div key={w.weekStart} className="wk-col">
            <span className="wk-tip">
              Tuần {label(w.weekStart)}: <b>{w.count}</b> tài liệu
            </span>
            {(i === latest || w.count === max) && w.count > 0 && <span className="wk-val">{w.count}</span>}
            <span
              className={cn('wk-bar', w.count === 0 && 'is-zero')}
              style={{ height: `${(w.count / top) * 100}%`, animationDelay: `${i * 45}ms` }}
            />
            <span className="wk-x">{label(w.weekStart)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { data } = useOverview();
  const update = useUpdateDocumentAdmin();
  const isAdmin = user?.role === 'ADMIN';
  useAdminCrumbs([{ label: 'Tổng quan' }]);

  const totalDocs = data ? DOCUMENT_STATUSES.reduce((n, s) => n + data.documentsByStatus[s], 0) : 0;
  const maxUni = Math.max(1, ...(data?.topUniversities.map((u) => u.documents) ?? [1]));
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  const decide = (id: string, status: DocumentStatus, title: string) =>
    update.mutate(
      { id, input: { status } },
      {
        onSuccess: () => toast.success(status === 'PUBLISHED' ? 'Đã duyệt đăng' : 'Đã từ chối', title),
        onError: (e) => toast.error('Không cập nhật được', toApiError(e).message),
      },
    );

  return (
    <>
      <AdminHead
        title={`${hello}, ${user?.name.split(' ').slice(-1)[0] ?? ''}`}
        description="Mọi thứ trên Kaned ở một chỗ: tài liệu đang chờ, trường và chương trình học, người dùng và những gì vừa thay đổi."
      />

      <div className="adm-stats">
        <StatCard icon={<Files className="ic" />} label="Tài liệu" value={data?.counts.documents} sub={data && `${fmtInt(data.documentsByStatus.PUBLISHED)} đang hiển thị`} to="/admin/documents" />
        <StatCard
          icon={<Clock className="ic" />}
          tone="amber"
          label="Chờ duyệt"
          value={data?.documentsByStatus.PENDING}
          sub={data?.documentsByStatus.PENDING ? 'Cần xem trước khi lên thư viện' : 'Không có gì đang chờ'}
          to="/admin/documents?status=PENDING"
        />
        <StatCard
          icon={<Building2 className="ic" />}
          tone="teal"
          label="Trường học"
          value={data?.counts.universities}
          sub={data && `${data.counts.faculties} khoa · ${data.counts.majors} ngành · ${data.counts.terms} kỳ học`}
          to={isAdmin ? '/admin/universities' : undefined}
        />
        <StatCard icon={<BookOpen className="ic" />} tone="blue" label="Môn học" value={data?.counts.subjects} to={isAdmin ? '/admin/subjects' : undefined} sub="Trên tất cả các trường" />
        <StatCard
          icon={<Users className="ic" />}
          tone="green"
          label="Người dùng"
          value={data?.counts.users}
          sub={data && `${data.usersByRole.ADMIN} quản trị · ${data.usersByRole.MODERATOR} kiểm duyệt`}
          to={isAdmin ? '/admin/users' : undefined}
        />
      </div>

      <div className="ov-grid">
        <div>
          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h2>Tài liệu mới mỗi tuần</h2>
                <p>8 tuần gần nhất, tính cả tệp và liên kết</p>
              </div>
            </div>
            {data ? <WeeklyChart weeks={data.uploadsByWeek} /> : <div className="skel" style={{ height: 220, margin: 18 }} />}
          </section>

          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h2>Đang chờ duyệt</h2>
                <p>Tài liệu được đăng ở trạng thái chờ — duyệt để hiện lên thư viện</p>
              </div>
              <span className="spacer" />
              <Link to="/admin/documents?status=PENDING" className="btn btn-ghost btn-sm">
                Tất cả
                <ArrowRight className="ic ic-xs" />
              </Link>
            </div>
            {data && data.pending.length === 0 ? (
              <EmptyState title="Không có tài liệu nào đang chờ" description="Tài liệu bạn tạo ở trạng thái “Chờ duyệt” sẽ xếp hàng ở đây." />
            ) : (
              <ul className="queue">
                {data?.pending.map((d) => (
                  <li key={d.id}>
                    <FileBadge format={d.format} linkUrl={d.linkUrl} />
                    <div className="q-main">
                      <Link to={`/admin/documents?open=${d.id}`} className="cell-title clamp-1">
                        {d.title}
                      </Link>
                      <span className="cell-sub">
                        {d.subject.code} · {d.uploader.name} · {timeAgo(d.createdAt)}
                      </span>
                    </div>
                    <div className="q-acts">
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => decide(d.id, 'PUBLISHED', d.title)} disabled={update.isPending}>
                        <Check className="ic ic-sm" />
                        Duyệt
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => decide(d.id, 'REJECTED', d.title)} disabled={update.isPending}>
                        Từ chối
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h2>Vừa thay đổi</h2>
                <p>Ai đã làm gì trong trang quản trị</p>
              </div>
              <span className="spacer" />
              <Link to="/admin/activity" className="btn btn-ghost btn-sm">
                <History className="ic ic-sm" />
                Nhật ký
              </Link>
            </div>
            {data && data.recentActivity.length === 0 ? (
              <EmptyState title="Chưa có thay đổi nào" description="Thêm trường, môn hay duyệt tài liệu — mọi thao tác đều được ghi lại ở đây." />
            ) : (
              <ul className="feed">
                {data?.recentActivity.map((a) => (
                  <ActivityLine key={a.id} a={a} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <section className="adm-panel">
            <div className="adm-panel-head">
              <h2>Thao tác nhanh</h2>
            </div>
            <div className="quick">
              <Link to="/admin/documents?new=1">
                <FilePlus2 className="ic ic-sm" />
                Đăng tài liệu
              </Link>
              {isAdmin && (
                <>
                  <Link to="/admin/universities?new=1">
                    <Building2 className="ic ic-sm" />
                    Thêm trường
                  </Link>
                  <Link to="/admin/subjects?new=1">
                    <BookOpen className="ic ic-sm" />
                    Thêm môn học
                  </Link>
                  <Link to="/admin/curriculum">
                    <RouteIcon className="ic ic-sm" />
                    Sửa chương trình
                  </Link>
                </>
              )}
            </div>
          </section>

          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h2>Trạng thái tài liệu</h2>
                <p>{fmtInt(totalDocs)} tài liệu</p>
              </div>
            </div>
            <div className="adm-panel-body">
              <div className="st-split" role="img" aria-label="Tỉ lệ tài liệu theo trạng thái">
                {data &&
                  DOCUMENT_STATUSES.filter((s) => data.documentsByStatus[s] > 0).map((s) => (
                    <i key={s} style={{ flexGrow: data.documentsByStatus[s], background: STATUS_COLOR[s] }} title={`${DOCUMENT_STATUS_LABELS[s].vi}: ${data.documentsByStatus[s]}`} />
                  ))}
              </div>
              <ul className="st-legend">
                {DOCUMENT_STATUSES.map((s) => (
                  <li key={s}>
                    <Swatch color={STATUS_COLOR[s]} />
                    {DOCUMENT_STATUS_LABELS[s].vi}
                    <b>{fmtInt(data?.documentsByStatus[s] ?? 0)}</b>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h2>Trường có nhiều tài liệu nhất</h2>
                <p>Tính mọi trạng thái</p>
              </div>
            </div>
            <ul className="uni-bars adm-panel-body">
              {data?.topUniversities.map((u, i) => (
                <li key={u.id}>
                  <span className="ub-name">
                    <Swatch color={u.color} />
                    <span>{u.name}</span>
                  </span>
                  <span className="ub-n">{fmtInt(u.documents)}</span>
                  <span className="ub-track">
                    <i style={{ width: `${(u.documents / maxUni) * 100}%`, animationDelay: `${i * 60}ms` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
