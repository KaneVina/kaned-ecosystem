import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ACTIVITY_FILTERS, ACTIVITY_FILTER_LABELS, OAUTH_PROVIDER_LABELS, ROLES, ROLE_LABELS, type ActivityFilter, type AdminUserDto, type Role } from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtDate, fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useOnlineUsers, useSetRole, useUniversitiesAdmin, useUsersAdmin } from './api';
import { Presence } from './presence';
import { AdminHead, ConfirmDialog, EmptyBlock, EmptyRow, Pager, RoleBadge, SearchBox, Swatch, TableSkeleton, useDebounced, type ConfirmState } from './ui';
import { SearchX } from 'lucide-react';
import { useAdminCrumbs } from './AdminShell';

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const [role, setRole] = useState<Role | ''>('');
  const [universityId, setUniversityId] = useState('');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const activity = (ACTIVITY_FILTERS as readonly string[]).includes(params.get('activity') ?? '') ? (params.get('activity') as ActivityFilter) : undefined;
  const setActivity = (a?: ActivityFilter) => setParams(a ? { activity: a } : {}, { replace: true });
  const { data, isLoading } = useUsersAdmin({
    q: query || undefined,
    role: role || undefined,
    universityId: universityId || undefined,
    activity,
    page,
    pageSize: 25,
  });
  const { data: online } = useOnlineUsers();
  const { data: universities = [] } = useUniversitiesAdmin();
  const setUserRole = useSetRole();
  useAdminCrumbs([{ label: 'Người dùng' }]);
  useEffect(() => setPage(1), [query, role, universityId, activity]);

  const change = (u: AdminUserDto, next: Role) => {
    if (next === u.role) return;
    const run = () =>
      setUserRole.mutateAsync({ id: u.id, role: next }).then(
        () => toast.success('Đã đổi quyền', `${u.name}: ${ROLE_LABELS[next].vi}`),
        (e) => {
          toast.error('Không đổi được quyền', toApiError(e).message);
          throw e;
        },
      );
    if (next === 'ADMIN' || u.role === 'ADMIN') {
      setConfirm({
        title: next === 'ADMIN' ? `Cấp quyền quản trị cho ${u.name}?` : `Thu hồi quyền quản trị của ${u.name}?`,
        body:
          next === 'ADMIN'
            ? 'Quản trị viên sửa được mọi trường, môn, chương trình, tài liệu và quyền của người khác.'
            : `${u.name} sẽ trở thành ${ROLE_LABELS[next].vi.toLowerCase()} và không vào được phần quản trị học vụ nữa.`,
        confirmLabel: next === 'ADMIN' ? 'Cấp quyền' : 'Thu hồi',
        run,
      });
    } else void run().catch(() => undefined);
  };

  const items = data?.items ?? [];

  return (
    <>
      <AdminHead title="Người dùng" count={data?.total} description="Quản trị viên sửa được mọi thứ; kiểm duyệt viên chỉ duyệt, sửa và gỡ tài liệu." />
      <section className="adm-panel">
        <div className="adm-tabs" role="tablist" aria-label="Hoạt động">
          {([undefined, ...ACTIVITY_FILTERS] as const).map((a) => (
            <button key={a ?? 'all'} type="button" role="tab" className="adm-tab" aria-selected={activity === a} onClick={() => setActivity(a)}>
              {a === 'online' && <span className="pres-dot" aria-hidden />}
              {a ? ACTIVITY_FILTER_LABELS[a] : 'Tất cả'}
              {a === 'online' && <span className="n">{online?.length ?? '–'}</span>}
            </button>
          ))}
        </div>
        <div className="adm-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm theo tên hoặc email…" />
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role | '')} aria-label="Quyền">
            <option value="">Mọi quyền</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r].vi}
              </option>
            ))}
          </select>
          <select className="select" value={universityId} onChange={(e) => setUniversityId(e.target.value)} aria-label="Trường">
            <option value="">Mọi trường</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </select>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table is-clickable">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Hoạt động</th>
                <th>Trường · ngành</th>
                <th className="num">Tài liệu</th>
                <th>Tham gia</th>
                <th>Quyền</th>
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={6} />
            ) : !items.length ? (
              <EmptyRow cols={6}>
                <EmptyBlock icon={SearchX} title="Không có người dùng khớp" text="Thử bỏ bộ lọc hoặc tìm bằng từ khác." />
              </EmptyRow>
            ) : (
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} onClick={() => navigate(`/admin/users/${u.id}`)}>
                    <td>
                      <div className="cell">
                        <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                        <div>
                          <span className="cell-title">
                            {u.name} {u.id === me?.id && <span className="chip-x" style={{ marginLeft: 6 }}>Bạn</span>}
                          </span>
                          <span className="cell-sub">
                            {u.email}
                            {u.signInMethods.length > 0 && (
                              <span className="sign-in-methods" title="Cách đăng nhập">
                                {' · '}
                                {u.signInMethods.map((m) => (m === 'password' ? 'Mật khẩu' : OAUTH_PROVIDER_LABELS[m])).join(', ')}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Presence online={u.online} lastSeenAt={u.lastSeenAt} compact />
                    </td>
                    <td style={{ fontSize: 13.5 }}>
                      {u.university ? (
                        <span className="cell-dot">
                          <Swatch color={u.university.color} />
                          {u.university.code}
                          {u.major ? <span className="muted">· {u.major.name}</span> : null}
                          {u.year ? <span className="muted">· năm {u.year}</span> : null}
                        </span>
                      ) : (
                        <span className="muted">Chưa chọn trường</span>
                      )}
                    </td>
                    <td className="num">{fmtInt(u.uploadCount)}</td>
                    <td className="w-date">{fmtDate(u.createdAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {u.id === me?.id ? (
                        <RoleBadge role={u.role} />
                      ) : (
                        <select
                          className="select role-select"
                          value={u.role}
                          disabled={setUserRole.isPending}
                          onChange={(e) => change(u, e.target.value as Role)}
                          aria-label={`Quyền của ${u.name}`}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r].vi}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {data && data.total > 0 && <Pager page={page} totalPages={data.totalPages} total={data.total} unit="người dùng" onPage={setPage} />}
      </section>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
