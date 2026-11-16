import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, ExternalLink, Pencil, Plus, Route as RouteIcon, SearchX, Trash2 } from 'lucide-react';
import { REGION_LABELS, UNIVERSITY_KIND_LABELS, type AdminUniversityDto, type Region, type UniversityKind } from '@kaned/shared';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtInt } from '@/lib/format';
import { useDeleteUniversity, useUniversitiesAdmin } from './api';
import { ActionMenu, AdminHead, ConfirmDialog, EmptyBlock, EmptyRow, SearchBox, TableSkeleton, UniMark, type ConfirmState } from './ui';
import { UniversityForm } from './forms';
import { useAdminCrumbs } from './AdminShell';

export { UniMark };

export function UniversitiesPage() {
  const toast = useToast();
  const navigate = useNavigate();
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
        count={data?.length}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus className="ic" />
            Thêm trường
          </button>
        }
      />

      <section className="adm-panel">
        <div className="adm-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm theo mã, tên, thành phố…" />
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table is-clickable">
            <thead>
              <tr>
                <th>Trường</th>
                <th>Khu vực</th>
                <th className="num">Khoa</th>
                <th className="num">Ngành</th>
                <th className="num">Môn</th>
                <th className="num">Kỳ học</th>
                <th className="num">Sinh viên</th>
                <th className="num">Tài liệu</th>
                <th className="w-menu" aria-label="Thao tác" />
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={9} rows={4} />
            ) : !list.length ? (
              <EmptyRow cols={9}>
                {q ? (
                  <EmptyBlock icon={SearchX} title="Không có trường khớp" text={`Không tìm thấy “${q}”.`} />
                ) : (
                  <EmptyBlock
                    icon={Building2}
                    title="Chưa có trường nào"
                    text="Thêm trường đầu tiên, rồi thêm khoa, ngành và kỳ học cho trường."
                    action={
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                        <Plus className="ic" />
                        Thêm trường
                      </button>
                    }
                  />
                )}
              </EmptyRow>
            ) : (
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} onClick={() => navigate(`/admin/universities/${u.id}`)}>
                    <td style={{ maxWidth: 0, width: '40%' }}>
                      <div className="cell">
                        <UniMark u={u} />
                        <div>
                          <span className="cell-title">{u.nameVi}</span>
                          <span className="cell-sub">
                            <b>{u.code}</b> · {u.name}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="cell-title" style={{ fontWeight: 500 }}>
                        {u.city}
                      </span>
                      <span className="cell-sub">
                        {REGION_LABELS[u.region as Region] ?? u.region} · {UNIVERSITY_KIND_LABELS[u.kind as UniversityKind] ?? u.kind}
                      </span>
                    </td>
                    <td className="num">{u.facultyCount}</td>
                    <td className="num">{u.majorCount}</td>
                    <td className="num">{fmtInt(u.subjectCount)}</td>
                    <td className="num">{u.termCount}</td>
                    <td className="num">{fmtInt(u.userCount)}</td>
                    <td className="num">{fmtInt(u.documentCount)}</td>
                    <td className="w-menu" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        label={`Thao tác cho ${u.code}`}
                        items={[
                          { label: 'Mở trường', icon: ExternalLink, onSelect: () => navigate(`/admin/universities/${u.id}`) },
                          { label: 'Sửa thông tin', icon: Pencil, onSelect: () => setEditing(u) },
                          { label: 'Môn học của trường', icon: RouteIcon, onSelect: () => navigate(`/admin/subjects?universityId=${u.id}`) },
                          'separator',
                          { label: 'Xoá trường', icon: Trash2, danger: true, onSelect: () => askDelete(u) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </section>

      <UniversityForm open={creating || Boolean(editing)} university={editing} onClose={() => (setCreating(false), setEditing(null))} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
