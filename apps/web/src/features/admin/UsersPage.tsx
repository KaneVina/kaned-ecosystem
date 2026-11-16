import { useEffect, useState } from 'react';
import { ROLES, ROLE_LABELS, type AdminUserDto, type Role } from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtDate, fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useSetRole, useUniversitiesAdmin, useUsersAdmin } from './api';
import { AdminHead, ConfirmDialog, EmptyRow, Pager, RoleBadge, SearchBox, TableSkeleton, useDebounced, type ConfirmState } from './ui';
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
  const { data, isLoading } = useUsersAdmin({ q: query || undefined, role: role || undefined, universityId: universityId || undefined, page, pageSize: 25 });
  const { data: universities = [] } = useUniversitiesAdmin();
  const setUserRole = useSetRole();
  useAdminCrumbs([{ label: 'Người dùng' }]);
  useEffect(() => setPage(1), [query, role, universityId]);

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
      <AdminHead
        title="Người dùng"
        description={
          <>
            {ROLES.map((r) => (
              <span key={r} style={{ marginRight: 14 }}>
                <b style={{ color: 'var(--ink)' }}>{ROLE_LABELS[r].vi}</b>: {ROLE_LABELS[r].hint.toLowerCase()}
              </span>
            ))}
          </>
        }
      />
      <section className="adm-panel">
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
          <table className={cn('adm-table', !isLoading && 'rows-in')}>
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Trường · ngành</th>
                <th className="num">Tài liệu</th>
                <th>Tham gia</th>
                <th>Quyền</th>
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={5} />
            ) : !items.length ? (
              <EmptyRow cols={5}>
                <EmptyState title="Không có người dùng khớp" description="Thử bỏ bộ lọc hoặc tìm bằng từ khác." />
              </EmptyRow>
            ) : (
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-main">
                        <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                        <div>
                          <span className="cell-title">
                            {u.name} {u.id === me?.id && <span className="badge badge-gray" style={{ height: 20, marginLeft: 4 }}>Bạn</span>}
                          </span>
                          <span className="cell-sub">
                            {u.email}
                            {u.hasGoogle ? ' · Google' : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13.5 }}>
                      {u.university ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className="adm-swatch" style={{ background: u.university.color }} />
                          {u.university.code}
                          {u.major ? <span className="muted">· {u.major.name}</span> : null}
                          {u.year ? <span className="muted">· năm {u.year}</span> : null}
                        </span>
                      ) : (
                        <span className="muted">Chưa chọn trường</span>
                      )}
                    </td>
                    <td className="num">{fmtInt(u.uploadCount)}</td>
                    <td style={{ fontSize: 13.5, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{fmtDate(u.createdAt)}</td>
                    <td>
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
        {data && <Pager page={page} totalPages={data.totalPages} total={data.total} unit="người dùng" onPage={setPage} />}
      </section>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
