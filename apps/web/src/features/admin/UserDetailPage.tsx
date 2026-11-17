import { Fragment, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Activity, CalendarClock, ChevronRight, Clock, Download, Eye, FileText, History, KeyRound, Link2, LogIn, LogOut, MonitorSmartphone, Search, ShieldOff, Star, Bookmark, Upload, UserPlus, type LucideIcon, GraduationCap } from 'lucide-react';
import {
  OAUTH_PROVIDER_LABELS,
  ROLE_LABELS,
  USER_EVENT_LABELS,
  USER_EVENT_TYPES,
  type ActivitySessionDto,
  type AdminUserDetailDto,
  type OAuthProviderId,
  type PageViewDto,
  type TrackedKind,
  type UserEventDto,
  type UserEventType,
} from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtClock, fmtDate, fmtDateTime, fmtDuration, fmtInt, fmtRelative } from '@/lib/format';
import { useSessionViews, useSignOutEverywhere, useUserActivity, useUserEvents, useUserSessions, useUserTopDocuments, useUserViews } from './api';
import { useAdminCrumbs } from './AdminShell';
import { ActionMenu, ConfirmDialog, EmptyBlock, EmptyRow, Pager, RoleBadge, TableSkeleton, type ConfirmState } from './ui';
import { DeviceLine, KIND_LABEL, KindIcon, methodLabel, Presence } from './presence';
import { UserGradesTab } from './UserGradesTab';

type Tab = 'grades' | 'sessions' | 'views' | 'documents' | 'events';
const TABS: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'grades', label: 'Điểm số', icon: GraduationCap },
  { id: 'sessions', label: 'Phiên truy cập', icon: MonitorSmartphone },
  { id: 'views', label: 'Lịch sử xem', icon: Eye },
  { id: 'documents', label: 'Tài liệu xem nhiều', icon: FileText },
  { id: 'events', label: 'Hoạt động', icon: History },
];

/** Where a viewed item leads inside the console, when it has a page of its own. */
function viewHref(v: { kind: TrackedKind; entityId: string | null }) {
  return v.kind === 'document' && v.entityId ? `/admin/documents?open=${v.entityId}` : null;
}

/* ───────────────────────────── header + stats ───────────────────────────── */

function MetricCard({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <div className="adm-stat">
      <span className="adm-stat-top">
        {label}
        <Icon className="ic" />
      </span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function DailyChart({ days }: { days: AdminUserDetailDto['daily'] }) {
  const minutes = days.map((d) => Math.round(d.seconds / 60));
  const max = Math.max(...minutes, 0);
  const step = max <= 10 ? 5 : max <= 30 ? 10 : max <= 120 ? 30 : 60;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [0, top / 2, top];
  const last = days.length - 1;
  const label = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const total = minutes.reduce((a, b) => a + b, 0);

  return (
    <div className="wk-chart ud-chart" role="img" aria-label={`Thời gian dùng mỗi ngày, 30 ngày qua, tổng ${total} phút`}>
      <div className="wk-axis" aria-hidden>
        {ticks.map((t) => (
          <span key={t} style={{ bottom: `calc(22px + (100% - 22px) * ${t / top})` }}>
            {t}p
          </span>
        ))}
      </div>
      <div className="wk-plot">
        {ticks.slice(1).map((t) => (
          <span key={t} className="wk-grid" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
        ))}
        {days.map((d, i) => (
          <div key={d.date} className="wk-col">
            <span className="wk-tip">
              {i === last ? 'Hôm nay' : label(d.date)}: <b>{fmtDuration(d.seconds)}</b>
            </span>
            <span className={cn('wk-bar', minutes[i] === 0 && 'is-zero')} style={{ height: `${(minutes[i] / top) * 100}%`, animationDelay: `${i * 12}ms` }} />
            <span className="wk-x">{i === last ? 'Hôm nay' : i % 5 === 0 && last - i >= 3 ? label(d.date) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HourStrip({ hours }: { hours: number[] }) {
  const max = Math.max(...hours, 1);
  const busiest = hours.indexOf(Math.max(...hours));
  return (
    <div className="hours">
      <div className="hours-bars" role="img" aria-label="Thời gian dùng theo giờ trong ngày, 30 ngày qua">
        {hours.map((s, h) => (
          <span key={h} className="hours-col" title={`${h}:00–${h + 1}:00 · ${fmtDuration(s)}`}>
            <i className={cn(s === 0 && 'is-zero')} style={{ height: `${Math.max(4, (s / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="hours-x" aria-hidden>
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>24h</span>
      </div>
      <p className="hours-note">
        {hours.some((s) => s > 0) ? (
          <>
            Hay dùng nhất khoảng <b>{busiest}h–{busiest + 1}h</b>
          </>
        ) : (
          'Chưa có dữ liệu trong 30 ngày qua'
        )}
      </p>
    </div>
  );
}

/* ─────────────────────────────── sessions ─────────────────────────────── */

function SessionTimeline({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useSessionViews(sessionId);
  if (isLoading) return <div className="tl-loading">Đang tải…</div>;
  const views = data ?? [];
  if (!views.length) return <div className="tl-loading">Phiên này không có trang nào.</div>;
  const max = Math.max(...views.map((v) => v.seconds), 1);
  return (
    <ol className="sess-tl">
      {views.map((v) => (
        <li key={v.id}>
          <time>{fmtClock(v.startedAt)}</time>
          <KindIcon kind={v.kind} />
          <ViewLabel v={v} />
          <span className="tl-bar" aria-hidden>
            <i style={{ width: `${Math.max(2, (v.seconds / max) * 100)}%` }} />
          </span>
          <span className="tl-dur">{v.live ? <span className="live-tag">Đang xem</span> : fmtDuration(v.seconds)}</span>
        </li>
      ))}
    </ol>
  );
}

function ViewLabel({ v }: { v: Pick<PageViewDto, 'kind' | 'entityId' | 'label' | 'path'> }) {
  const href = viewHref(v);
  return href ? (
    <Link to={href} className="tl-label" title={v.path}>
      {v.label}
    </Link>
  ) : (
    <span className="tl-label" title={v.path}>
      {v.label}
    </span>
  );
}

function SessionsTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useUserSessions(userId, page);
  const items = data?.items ?? [];

  return (
    <>
      <div className="adm-table-wrap">
        <table className="adm-table is-clickable">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th>Bắt đầu</th>
              <th className="num">Thời gian dùng</th>
              <th className="num">Trang</th>
              <th>Thiết bị</th>
              <th>IP</th>
            </tr>
          </thead>
          {isLoading ? (
            <TableSkeleton cols={6} rows={5} />
          ) : !items.length ? (
            <EmptyRow cols={6}>
              <EmptyBlock icon={MonitorSmartphone} title="Chưa có phiên nào" text="Phiên được ghi khi người này mở Kaned sau khi đăng nhập." />
            </EmptyRow>
          ) : (
            <tbody>
              {items.map((s: ActivitySessionDto) => {
                const expanded = open === s.id;
                const span = (new Date(s.lastSeenAt).getTime() - new Date(s.startedAt).getTime()) / 1000;
                return (
                  <Fragment key={s.id}>
                    <tr className={cn(expanded && 'is-selected')} onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded}>
                      <td>
                        <ChevronRight className={cn('ic chev', expanded && 'is-open')} />
                      </td>
                      <td>
                        <span className="cell-title">{fmtDateTime(s.startedAt)}</span>
                        <span className="cell-sub">
                          {s.online ? <span className="live-tag">Đang diễn ra</span> : `đến ${fmtClock(s.lastSeenAt)} · kéo dài ${fmtDuration(span)}`}
                        </span>
                      </td>
                      <td className="num">
                        <b className="dur">{fmtDuration(s.activeSeconds)}</b>
                      </td>
                      <td className="num">{s.pageCount}</td>
                      <td>
                        <DeviceLine d={s} />
                      </td>
                      <td className="w-date ip-text">{s.ip ?? '—'}</td>
                    </tr>
                    {expanded && (
                      <tr className="tl-row">
                        <td colSpan={6}>
                          <SessionTimeline sessionId={s.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
      {data && <Pager page={page} totalPages={data.totalPages} total={data.total} onPage={setPage} unit="phiên" />}
    </>
  );
}

/* ──────────────────────────────── views ──────────────────────────────── */

function ViewsTab({ userId }: { userId: string }) {
  const [kind, setKind] = useState<TrackedKind | undefined>(undefined);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useUserViews(userId, { kind, page });
  const items = data?.items ?? [];

  return (
    <>
      <div className="adm-toolbar">
        <div className="kind-seg" role="radiogroup" aria-label="Loại trang">
          {([undefined, 'document', 'subject', 'page'] as const).map((k) => (
            <button
              key={k ?? 'all'}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                setPage(1);
              }}
            >
              {k ? KIND_LABEL[k] : 'Tất cả'}
            </button>
          ))}
        </div>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Đã xem</th>
              <th>Loại</th>
              <th className="num">Thời gian xem</th>
              <th>Lúc</th>
            </tr>
          </thead>
          {isLoading ? (
            <TableSkeleton cols={4} rows={6} />
          ) : !items.length ? (
            <EmptyRow cols={4}>
              <EmptyBlock icon={Eye} title="Chưa xem gì" text="Trang, tài liệu và môn học người này mở sẽ hiện ở đây." />
            </EmptyRow>
          ) : (
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="cell">
                      <KindIcon kind={v.kind} />
                      <div>
                        <ViewLabel v={v} />
                        <span className="cell-sub ip-text">{v.path}</span>
                      </div>
                    </div>
                  </td>
                  <td className="w-date">{KIND_LABEL[v.kind]}</td>
                  <td className="num">{v.live ? <span className="live-tag">Đang xem</span> : <b className="dur">{fmtDuration(v.seconds)}</b>}</td>
                  <td className="w-date">{fmtDateTime(v.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      {data && <Pager page={page} totalPages={data.totalPages} total={data.total} onPage={setPage} unit="lượt xem" />}
    </>
  );
}

/* ───────────────────────────── top documents ───────────────────────────── */

function DocumentsTab({ userId }: { userId: string }) {
  const { data, isLoading } = useUserTopDocuments(userId);
  const items = data ?? [];
  const max = Math.max(...items.map((d) => d.seconds), 1);
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Tài liệu</th>
            <th style={{ width: '28%' }}>Tổng thời gian xem</th>
            <th className="num">Số lần mở</th>
            <th>Xem gần nhất</th>
          </tr>
        </thead>
        {isLoading ? (
          <TableSkeleton cols={4} rows={5} />
        ) : !items.length ? (
          <EmptyRow cols={4}>
            <EmptyBlock icon={FileText} title="Chưa mở tài liệu nào" text="Tài liệu được xếp theo tổng thời gian người này đọc." />
          </EmptyRow>
        ) : (
          <tbody>
            {items.map((d) => (
              <tr key={d.documentId}>
                <td>
                  <Link to={`/admin/documents?open=${d.documentId}`} className="cell-title">
                    {d.title}
                  </Link>
                  {d.subjectCode && <span className="cell-sub">{d.subjectCode}</span>}
                </td>
                <td>
                  <span className="bar-cell">
                    <span className="bar-track">
                      <i style={{ width: `${(d.seconds / max) * 100}%` }} />
                    </span>
                    <b className="dur">{fmtDuration(d.seconds)}</b>
                  </span>
                </td>
                <td className="num">{d.views}</td>
                <td className="w-date">{fmtRelative(d.lastViewedAt)}</td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

/* ──────────────────────────────── events ──────────────────────────────── */

const EVENT_ICON: Record<UserEventType, LucideIcon> = {
  sign_up: UserPlus,
  sign_in: LogIn,
  sign_out: LogOut,
  password_change: KeyRound,
  provider_link: Link2,
  provider_unlink: Link2,
  search: Search,
  download: Download,
  upload: Upload,
  bookmark: Bookmark,
  review: Star,
  signed_out_by_admin: ShieldOff,
};

function eventText(e: UserEventDto) {
  const d = e.data;
  const doc = (verb: string) =>
    d.documentId ? (
      <>
        {verb}{' '}
        <Link to={`/admin/documents?open=${String(d.documentId)}`} className="ev-link">
          {d.title ? `“${String(d.title)}”` : 'một tài liệu'}
        </Link>
      </>
    ) : (
      verb
    );
  switch (e.type) {
    case 'sign_in':
      return `Đăng nhập bằng ${methodLabel(d.method)}`;
    case 'sign_up':
      return `Tạo tài khoản bằng ${methodLabel(d.method)}`;
    case 'sign_out':
      return 'Đăng xuất';
    case 'password_change':
      return d.first ? 'Đặt mật khẩu lần đầu' : 'Đổi mật khẩu';
    case 'provider_link':
      return `Liên kết ${OAUTH_PROVIDER_LABELS[d.provider as OAuthProviderId] ?? 'tài khoản'}`;
    case 'provider_unlink':
      return `Bỏ liên kết ${OAUTH_PROVIDER_LABELS[d.provider as OAuthProviderId] ?? 'tài khoản'}`;
    case 'search':
      return (
        <>
          Tìm <b>“{String(d.q ?? '')}”</b>
          {typeof d.results === 'number' && <span className="ev-meta"> · {fmtInt(d.results)} kết quả</span>}
        </>
      );
    case 'download':
      return doc('Tải');
    case 'upload':
      return doc('Đăng');
    case 'bookmark':
      return doc(d.saved ? 'Lưu' : 'Bỏ lưu');
    case 'review':
      return doc(`Đánh giá ${String(d.score ?? '')} sao cho`);
    case 'signed_out_by_admin':
      return `Bị quản trị viên đăng xuất khỏi ${String(d.sessions ?? 0)} phiên`;
  }
}

function EventsTab({ userId }: { userId: string }) {
  const [type, setType] = useState<UserEventType | ''>('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useUserEvents(userId, { type: type || undefined, page });
  const items = data?.items ?? [];

  return (
    <>
      <div className="adm-toolbar">
        <select
          className={cn('select', type && 'is-on')}
          value={type}
          onChange={(e) => {
            setType(e.target.value as UserEventType | '');
            setPage(1);
          }}
          aria-label="Loại hoạt động"
        >
          <option value="">Mọi hoạt động</option>
          {USER_EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {USER_EVENT_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <div className="adm-panel-body">
          <div className="skel" style={{ height: 180, borderRadius: 8 }} />
        </div>
      ) : !items.length ? (
        <EmptyBlock icon={History} title="Chưa có hoạt động" text="Đăng nhập, tìm kiếm, tải, đăng, lưu và đánh giá tài liệu được ghi lại ở đây." />
      ) : (
        <ul className="ev-list">
          {items.map((e) => {
            const Icon = EVENT_ICON[e.type] ?? Activity;
            return (
              <li key={e.id}>
                <span className={cn('ev-ic', `ev-${e.type}`)}>
                  <Icon className="ic" />
                </span>
                <span className="ev-text">{eventText(e)}</span>
                {e.ip && <span className="ev-ip ip-text">{e.ip}</span>}
                <time title={fmtDateTime(e.createdAt)}>{fmtRelative(e.createdAt)}</time>
              </li>
            );
          })}
        </ul>
      )}
      {data && <Pager page={page} totalPages={data.totalPages} total={data.total} onPage={setPage} unit="hoạt động" />}
    </>
  );
}

/* ──────────────────────────────── page ──────────────────────────────── */

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { user: me } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'sessions') as Tab;
  const { data, isLoading, error } = useUserActivity(id);
  const signOut = useSignOutEverywhere();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  useAdminCrumbs([{ label: 'Người dùng', to: '/admin/users' }, { label: data?.user.name ?? '…' }], [data?.user.name]);

  const s = data?.stats;
  const u = data?.user;
  const methods = useMemo(() => u?.signInMethods.map((m) => (m === 'password' ? 'Mật khẩu' : OAUTH_PROVIDER_LABELS[m])).join(', '), [u]);

  if (error) {
    return <EmptyBlock icon={ShieldOff} title="Không mở được tài khoản này" text={toApiError(error).message} action={<Link to="/admin/users" className="btn btn-secondary">Về danh sách</Link>} />;
  }

  return (
    <>
      {u && s ? (
        <div className="uni-hero ud-hero">
          <Avatar name={u.name} src={u.avatarUrl} size="lg" />
          <div style={{ minWidth: 0 }}>
            <h1>
              {u.name}
              <RoleBadge role={u.role} />
            </h1>
            <p>
              {u.email}
              {u.university && ` · ${u.university.code}`}
              {u.major && ` · ${u.major.name}`}
              {u.year && ` · năm ${u.year}`}
            </p>
            <p className="ud-meta">
              <Presence online={s.online} lastSeenAt={s.lastSeenAt} />
              <span>Tham gia {fmtDate(u.createdAt)}</span>
              {methods && <span>Đăng nhập bằng {methods}</span>}
            </p>
          </div>
          <span className="spacer" />
          {u.id !== me?.id && (
            <ActionMenu
              label="Thao tác"
              items={[
                {
                  label: 'Đăng xuất mọi thiết bị',
                  icon: LogOut,
                  danger: true,
                  onSelect: () =>
                    setConfirm({
                      title: `Đăng xuất ${u.name} khỏi mọi thiết bị?`,
                      body: 'Mọi phiên đăng nhập của tài khoản này bị thu hồi. Tab đang mở sẽ bị đăng xuất trong vòng 15 phút, khi mã truy cập hết hạn. Dữ liệu không mất.',
                      confirmLabel: 'Đăng xuất',
                      run: () =>
                        signOut.mutateAsync(u.id).then(
                          (r) => toast.success('Đã đăng xuất', `${r.revoked} phiên của ${u.name} đã bị thu hồi.`),
                          (e) => {
                            toast.error('Không đăng xuất được', toApiError(e).message);
                            throw e;
                          },
                        ),
                    }),
                },
              ]}
            />
          )}
        </div>
      ) : (
        <div className="uni-hero">
          <div className="skel" style={{ width: 64, height: 64, borderRadius: 999 }} />
          <div style={{ flex: 1 }}>
            <div className="skel" style={{ width: 240, height: 20, borderRadius: 6 }} />
            <div className="skel" style={{ width: 320, height: 14, borderRadius: 6, marginTop: 10 }} />
          </div>
        </div>
      )}

      {data?.current && (
        <div className="now-strip" role="status">
          <span className="now-dot" aria-hidden />
          <span>
            Đang xem <ViewLabel v={data.current} />
          </span>
          <span className="now-since">từ {fmtRelative(data.current.since)}</span>
        </div>
      )}

      <div className="adm-stats">
        <MetricCard icon={Clock} label="Hôm nay" value={s ? fmtDuration(s.activeSecondsToday) : '…'} sub={s ? `7 ngày qua: ${fmtDuration(s.activeSeconds7d)}` : undefined} />
        <MetricCard
          icon={CalendarClock}
          label="30 ngày qua"
          value={s ? fmtDuration(s.activeSeconds30d) : '…'}
          sub={s ? `${s.sessions30d} phiên · TB ${fmtDuration(s.avgSessionSeconds30d)}/phiên` : undefined}
        />
        <MetricCard
          icon={Eye}
          label="Tài liệu đã xem"
          value={s ? fmtInt(s.documentsViewed30d) : '…'}
          sub={s ? `30 ngày · ${s.downloads30d} lượt tải · ${s.searches30d} lượt tìm` : undefined}
        />
        <MetricCard
          icon={LogIn}
          label="Đăng nhập gần nhất"
          value={s ? (s.lastSignInAt ? fmtRelative(s.lastSignInAt) : '—') : '…'}
          sub={s ? `Tổng thời gian dùng: ${fmtDuration(s.activeSecondsAll)} · ${s.uploads} tài liệu đã đăng` : undefined}
        />
      </div>

      <div className="ud-grid">
        <section className="adm-panel">
          <div className="adm-panel-head">
            <div>
              <h2>Thời gian dùng mỗi ngày</h2>
              <p>30 ngày gần nhất · chỉ tính lúc tab đang mở và có thao tác</p>
            </div>
          </div>
          {data ? <DailyChart days={data.daily} /> : <div className="skel" style={{ height: 204, margin: 16, borderRadius: 8 }} />}
        </section>
        <section className="adm-panel">
          <div className="adm-panel-head">
            <div>
              <h2>Khung giờ & thiết bị</h2>
              <p>30 ngày gần nhất</p>
            </div>
          </div>
          <div className="adm-panel-body">
            {data ? <HourStrip hours={data.hours} /> : <div className="skel" style={{ height: 90, borderRadius: 8 }} />}
            <dl className="ud-facts">
              <div>
                <dt>Thiết bị gần nhất</dt>
                <dd>{data?.lastDevice ? <DeviceLine d={data.lastDevice} /> : '—'}</dd>
              </div>
              <div>
                <dt>IP gần nhất</dt>
                <dd className="ip-text">{data?.lastDevice?.ip ?? '—'}</dd>
              </div>
              <div>
                <dt>Quyền</dt>
                <dd>{u ? ROLE_LABELS[u.role].vi : '—'}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <section className="adm-panel">
        <div className="adm-tabs" role="tablist" aria-label="Chi tiết người dùng">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" className="adm-tab" aria-selected={tab === t.id} onClick={() => setParams({ tab: t.id }, { replace: true })}>
              <t.icon className="ic" />
              {t.label}
            </button>
          ))}
        </div>
        {!isLoading && id && (
          <>
            {tab === 'grades' && <UserGradesTab userId={id} />}
            {tab === 'sessions' && <SessionsTab userId={id} />}
            {tab === 'views' && <ViewsTab userId={id} />}
            {tab === 'documents' && <DocumentsTab userId={id} />}
            {tab === 'events' && <EventsTab userId={id} />}
          </>
        )}
      </section>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
