import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { UNIVERSITY_KIND_LABELS, type AdminUniversityDto, type UniversityKind } from '@kaned/shared';
import { EmptyState } from '@/components/ui/Feedback';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtInt } from '@/lib/format';
import { useDeleteUniversity, useUniversitiesAdmin } from './api';
import { AdminHead, ConfirmDialog, SearchBox, type ConfirmState } from './ui';
import { UniversityForm } from './forms';
import { useAdminCrumbs } from './AdminShell';

export function UniMark({ u, size }: { u: Pick<AdminUniversityDto, 'code' | 'color'>; size?: number }) {
  return (
    <span className="adm-uni-mark" style={{ background: u.color, ...(size ? { width: size, height: size } : {}) }} aria-hidden>
      {u.code.length > 5 ? u.code.slice(0, 4) : u.code}
    </span>
  );
}

export function UniversitiesPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useUniversitiesAdmin();
  const remove = useDeleteUniversity();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<AdminUniversityDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  useAdminCrumbs([{ label: 'Trường học' }]);

  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const list = (data ?? []).filter((u) => {
    const t = q.trim().toLowerCase();
    return !t || [u.code, u.name, u.nameVi, u.city].some((x) => x.toLowerCase().includes(t));
  });

  const askDelete = (u: AdminUniversityDto) =>
    setConfirm({
      title: `Xoá ${u.code}?`,
      body: (
        <>
          Xoá <b>{u.nameVi}</b> sẽ xoá luôn {u.facultyCount} khoa, {u.majorCount} ngành, {u.subjectCount} môn và {u.termCount} kỳ học của trường.
          {u.userCount > 0 && ` ${u.userCount} sinh viên sẽ phải chọn lại trường.`} Không hoàn tác được.
        </>
      ),
      confirmLabel: 'Xoá trường',
      typeToConfirm: u.code,
      run: () =>
        remove.mutateAsync(u.id).then(
          () => toast.success('Đã xoá trường', u.nameVi),
          (e) => {
            toast.error('Không xoá được', toApiError(e).message);
            throw e;
          },
        ),
    });

  return (
    <>
      <AdminHead
        title="Trường học"
        description="Mỗi trường có khoa, ngành, kỳ học và môn học riêng. Thêm trường mới là sinh viên trường đó dùng được ngay thư viện và công cụ môn học."
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Tìm trường…" />
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus className="ic ic-sm" />
              Thêm trường
            </button>
          </>
        }
      />

      {isLoading ? (
        <div className="uni-admin-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skel" style={{ height: 168, borderRadius: 14 }} />
          ))}
        </div>
      ) : !list.length && q ? (
        <EmptyState title="Không có trường khớp" description={`Không tìm thấy “${q}”.`} />
      ) : (
        <div className="uni-admin-grid">
          {list.map((u, i) => (
            <Link key={u.id} to={`/admin/universities/${u.id}`} className="ua-card" style={{ ['--uc' as string]: u.color, animationDelay: `${i * 40}ms` }}>
              <div className="ua-top">
                <UniMark u={u} />
                <div>
                  <b>{u.nameVi}</b>
                  <span>
                    {u.code} · {u.city} · {UNIVERSITY_KIND_LABELS[u.kind as UniversityKind] ?? u.kind}
                  </span>
                </div>
              </div>
              <dl className="ua-stats">
                <div>
                  <dt>Ngành</dt>
                  <dd>{u.majorCount}</dd>
                </div>
                <div>
                  <dt>Môn</dt>
                  <dd>{fmtInt(u.subjectCount)}</dd>
                </div>
                <div>
                  <dt>Kỳ học</dt>
                  <dd>{u.termCount}</dd>
                </div>
                <div>
                  <dt>Tài liệu</dt>
                  <dd>{fmtInt(u.documentCount)}</dd>
                </div>
              </dl>
              <div className="row-acts" onClick={(e) => e.preventDefault()}>
                <button type="button" className="icon-btn" aria-label={`Sửa ${u.code}`} onClick={() => setEditing(u)}>
                  <Pencil className="ic ic-sm" />
                </button>
                <button type="button" className="icon-btn is-danger" aria-label={`Xoá ${u.code}`} onClick={() => askDelete(u)}>
                  <Trash2 className="ic ic-sm" />
                </button>
              </div>
            </Link>
          ))}
          {!q && (
            <button type="button" className="ua-add" onClick={() => setCreating(true)}>
              <Building2 className="ic ic-lg" />
              Thêm trường
            </button>
          )}
        </div>
      )}

      <UniversityForm open={creating || Boolean(editing)} university={editing} onClose={() => (setCreating(false), setEditing(null))} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
