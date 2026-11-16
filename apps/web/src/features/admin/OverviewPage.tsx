import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Building2, Check, Clock, FilePlus2, Files, FolderInput, Pencil, Plus, Route as RouteIcon, Trash2, UserCog, Users, X, type LucideIcon } from 'lucide-react';
import { DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS, type ActivityDto, type DocumentStatus } from '@kaned/shared';
import { FileIcon } from '@/components/ui/FileBadge';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtInt, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useOverview, useUpdateDocumentAdmin } from './api';
import { AdminHead, EmptyBlock, StatCard, Swatch } from './ui';
import { useAdminCrumbs } from './AdminShell';

/** Status colours: reserved for status, always shown with their label and count. */
const STATUS_COLOR: Record<DocumentStatus, string> = {
  PUBLISHED: '#17865B',
  PENDING: '#E39A1F',
  REJECTED: '#CF3A31',
  REMOVED: '#A2A1AF',
};

const ACTION_ICON: Record<string, { icon: LucideIcon; tone?: 'good' | 'bad' }> = {
  create: { icon: Plus, tone: 'good' },
  update: { icon: Pencil },
  move: { icon: FolderInput },
  delete: { icon: Trash2, tone: 'bad' },
  publish: { icon: Check, tone: 'good' },
  reject: { icon: X, tone: 'bad' },
  remove: { icon: X },
  role: { icon: UserCog },
};

export function ActivityLine({ a }: { a: ActivityDto }) {
  const meta = ACTION_ICON[a.action] ?? ACTION_ICON.update;
  return (
    <li>
      <span className={cn('feed-ic', meta.tone === 'good' && 'is-good', meta.tone === 'bad' && 'is-bad')}>
        <meta.icon className="ic" />
      </span>
      <div>
        <p>
          <b>{a.actor?.name ?? 'Hệ thống'}</b> {a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}
        </p>
        <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString('vi-VN')}>
          {timeAgo(a.createdAt)}
        </time>
      </div>
    </li>
  );
}

/** One series (documents created per week), so no legend: the panel title names it. */
function WeeklyChart({ weeks }: { weeks: Array<{ weekStart: string; count: number }> }) {
  const max = Math.max(...weeks.map((w) => w.count));
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const label = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  };
  const last = weeks.length - 1;

  return (
    <div className="wk-chart" role="img" aria-label={`Tài liệu mới mỗi tuần: ${weeks.map((w) => `tuần ${label(w.weekStart)}: ${w.count}`).join(', ')}`}>
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
              Tuần từ {label(w.weekStart)}: <b>{w.count}</b> tài liệu
            </span>
            {(i === last || (w.count === max && max > 0)) && w.count > 0 && <span className="wk-val">{w.count}</span>}
            <span className={cn('wk-bar', w.count === 0 && 'is-zero')} style={{ height: `${(w.count / top) * 100}%`, animationDelay: `${i * 40}ms` }} />
            <span className="wk-x">{i === last ? 'Tuần này' : label(w.weekStart)}</span>
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

  const total = data ? DOCUMENT_STATUSES.reduce((n, s) => n + data.documentsByStatus[s], 0) : 0;
  const maxUni = Math.max(1, ...(data?.topUniversities.map((u) => u.documents) ?? [1]));
  const pending = data?.documentsByStatus.PENDING ?? 0;
  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
        title="Tổng quan"
        description={today.charAt(0).toUpperCase() + today.slice(1)}
        actions={
          <Link to="/admin/documents?new=1" className="btn btn-secondary">
            <FilePlus2 className="ic" />
            Đăng tài liệu
          </Link>
        }
      />

      <div className="adm-stats">
        <StatCard icon={Files} label="Tài liệu" value={data?.counts.documents} sub={data && `${fmtInt(data.documentsByStatus.PUBLISHED)} đang hiển thị`} to="/admin/documents" />
        <StatCard
          icon={Clock}
          label="Chờ duyệt"
          value={data?.documentsByStatus.PENDING}
          attention={pending > 0}
          sub={pending ? 'Cần duyệt trước khi lên thư viện' : 'Không có gì đang chờ'}
          to="/admin/documents?status=PENDING"
        />
        <StatCard icon={Building2} label="Trường học" value={data?.counts.universities} sub={data && `${data.counts.majors} ngành · ${data.counts.terms} kỳ học`} to={isAdmin ? '/admin/universities' : undefined} />
        <StatCard icon={BookOpen} label="Môn học" value={data?.counts.subjects} sub="Trên tất cả các trường" to={isAdmin ? '/admin/subjects' : undefined} />
        <StatCard icon={Users} label="Người dùng" value={data?.counts.users} sub={data && `${data.usersByRole.ADMIN} quản trị · ${data.usersByRole.MODERATOR} kiểm duyệt`} to={isAdmin ? '/admin/users' : undefined} />
      </div>

      <div className="ov-grid">
        <div className="ov-col">
          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h2>Tài liệu mới</h2>
                <p>Mỗi tuần, 8 tuần gần nhất</p>
              </div>
            </div>
            {data ? <WeeklyChart weeks={data.uploadsByWeek} /> : <div className="skel" style={{ height: 204, margin: 16, borderRadius: 8 }} />}
          </section>

          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h2>Chờ duyệt</h2>
                <p>Duyệt để tài liệu hiện trong thư viện</p>
              </div>
              <span className="spacer" />
              <Link to="/admin/documents?status=PENDING" className="btn btn-ghost btn-sm">
                Xem tất cả
                <ArrowRight className="ic" />
              </Link>
            </div>
            {data && data.pending.length === 0 ? (
              <EmptyBlock icon={Check} title="Không có tài liệu nào chờ duyệt" text="Tài liệu đăng ở trạng thái “Chờ duyệt” sẽ xếp hàng ở đây." />
            ) : (
              <ul className="queue">
                {data?.pending.map((d) => (
                  <li key={d.id}>
                    <FileIcon format={d.format} size="xs" />
                    <div className="q-main">
                      <Link to={`/admin/documents?open=${d.id}`} className="cell-title">
                        {d.title}
                      </Link>
                      <span className="cell-sub">
                        <b>{d.subject.code}</b> · {d.uploader.name} · {timeAgo(d.createdAt)}
                      </span>
                    </div>
                    <div className="q-acts">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => decide(d.id, 'REJECTED', d.title)} disabled={update.isPending}>
                        Từ chối
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => decide(d.id, 'PUBLISHED', d.title)} disabled={update.isPending}>
                        Duyệt
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="ov-col">
          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h2>Trạng thái tài liệu</h2>
                <p>{fmtInt(total)} tài liệu</p>
              </div>
            </div>
            <div className="adm-panel-body">
              <div className="st-split" aria-hidden>
                {data &&
                  DOCUMENT_STATUSES.filter((s) => data.documentsByStatus[s] > 0).map((s) => (
                    <i key={s} style={{ flexGrow: data.documentsByStatus[s], background: STATUS_COLOR[s] }} />
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
                <h2>Theo trường</h2>
                <p>Số tài liệu, mọi trạng thái</p>
              </div>
            </div>
            <ul className="uni-bars" style={{ padding: '4px 16px 8px' }}>
              {data?.topUniversities.map((u, i) => (
                <li key={u.id}>
                  <span className="ub-name">
                    <Swatch color={u.color} />
                    <span>{u.name}</span>
                  </span>
                  <span className="ub-n">{fmtInt(u.documents)}</span>
                  <span className="ub-track">
                    <i style={{ width: `${(u.documents / maxUni) * 100}%`, animationDelay: `${i * 50}ms` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h2>Hoạt động gần đây</h2>
              </div>
              <span className="spacer" />
              <Link to="/admin/activity" className="btn btn-ghost btn-sm">
                Nhật ký
                <ArrowRight className="ic" />
              </Link>
            </div>
            {data && data.recentActivity.length === 0 ? (
              <EmptyBlock icon={RouteIcon} title="Chưa có thay đổi nào" text="Mọi thao tác trong trang quản trị được ghi lại ở đây." />
            ) : (
              <ul className="feed">
                {data?.recentActivity.slice(0, 6).map((a) => (
                  <ActivityLine key={a.id} a={a} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
