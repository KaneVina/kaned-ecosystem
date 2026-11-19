import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LECTURER_KIND_LABELS, LECTURER_KINDS, STAFF_ROLES, type LecturerKind } from '@kaned/shared';
import { PageHead } from '@/components/ui/Panel';
import { BigSearch } from '@/components/ui/BigSearch';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useUniversities } from '@/features/catalog/queries';
import { useAuth } from '@/providers/AuthProvider';
import { fmtInt } from '@/lib/format';
import { useLecturerDepartments, useLecturers } from './api';
import { LecturerCard } from './LecturerProfile';
import './lecturers.css';

/** "Tra cứu giảng viên": search by name, code, department or email; filter by school and department. */
export function LecturersPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const uni = params.get('university') ?? user?.university?.id ?? '';
  const dept = params.get('department') ?? '';
  const kindParam = params.get('kind');
  const kind = (LECTURER_KINDS as readonly string[]).includes(kindParam ?? '') ? (kindParam as LecturerKind) : '';
  const who = kind ? LECTURER_KIND_LABELS[kind].toLowerCase() : 'người';
  const page = Number(params.get('page') ?? 1) || 1;
  const unis = useUniversities();
  const depts = useLecturerDepartments(uni);
  const staff = user && STAFF_ROLES.includes(user.role);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debounced) next.set('q', debounced);
    else next.delete('q');
    if (debounced !== (params.get('q') ?? '')) next.delete('page');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'university') next.delete('department');
    setParams(next, { replace: true });
  };

  const query = { q: debounced || undefined, universityId: uni || undefined, department: dept || undefined, kind: kind || undefined, page, pageSize: 24 };
  const { data, isLoading, isError, refetch, isFetching } = useLecturers(query);
  const hints = useMemo(() => ['“Nguyễn”', '“Kỹ thuật phần mềm”', '“@fe.edu.vn”', '“mã giảng viên”'], []);

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Tra cứu giảng viên' }]}
        title="Tra cứu giảng viên"
        description="Tìm giảng viên và cán bộ theo tên, mã, bộ môn hoặc email để xem thông tin liên hệ, liên kết và tài liệu môn họ dạy."
        actions={
          staff ? (
            <Link className="btn btn-secondary btn-sm" to="/admin/lecturers">
              Quản lý giảng viên
            </Link>
          ) : undefined
        }
      >
        <BigSearch id="lec-q" value={q} onChange={setQ} label="Tìm giảng viên" placeholder="Tên, mã, bộ môn hoặc email, có dấu hay không đều được" hints={hints} />
      </PageHead>
      <div className="container lec-body">
        <div className="lec-filters">
          <div className="seg lec-seg" role="group" aria-label="Lọc theo loại">
            {(['', ...LECTURER_KINDS] as const).map((k) => (
              <button key={k || 'all'} type="button" aria-pressed={kind === k} onClick={() => set('kind', k)}>
                {k ? LECTURER_KIND_LABELS[k] : 'Tất cả'}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="lec-uni">
            Trường
          </label>
          <select id="lec-uni" className="select" value={uni} onChange={(e) => set('university', e.target.value)}>
            <option value="">Tất cả trường</option>
            {(unis.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} · {u.nameVi}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="lec-dept">
            Bộ môn
          </label>
          <select id="lec-dept" className="select" value={dept} onChange={(e) => set('department', e.target.value)} disabled={!depts.data?.length}>
            <option value="">Tất cả bộ môn</option>
            {(depts.data ?? []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="lec-count" aria-live="polite">
            {data ? `${fmtInt(data.total)} ${who}` : ''}
          </span>
        </div>

        {isLoading ? (
          <div className="lec-grid">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} style={{ height: 96, borderRadius: 14 }} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data?.items.length ? (
          debounced || dept || kind ? (
            <EmptyState
              title={`Không tìm thấy ${who === 'người' ? 'ai' : who}`}
              description={`Không có ai khớp${debounced ? ` “${debounced}”` : ''}${dept ? ` trong bộ môn ${dept}` : ''}. Thử tên ngắn hơn hoặc bỏ bớt bộ lọc.`}
            />
          ) : (
            <EmptyState
              title="Chưa có giảng viên nào"
              description={staff ? 'Thêm giảng viên ở trang quản trị, hoặc dán cả danh sách từ Excel.' : 'Danh bạ giảng viên của trường sẽ hiện ở đây khi được cập nhật.'}
              action={
                staff ? (
                  <Link className="btn btn-primary" to="/admin/lecturers">
                    Thêm giảng viên
                  </Link>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            <div className={isFetching ? 'lec-grid is-busy' : 'lec-grid'}>
              {data.items.map((l) => (
                <LecturerCard key={l.id} l={l} />
              ))}
            </div>
            {data.totalPages > 1 && (
              <nav className="lec-pager" aria-label="Trang">
                <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
                  Trang trước
                </button>
                <span>
                  Trang {page} / {data.totalPages}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={page >= data.totalPages} onClick={() => set('page', String(page + 1))}>
                  Trang sau
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </>
  );
}
