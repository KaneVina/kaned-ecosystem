import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ExternalLink, EyeOff, FilePlus2, Files, Pencil, RotateCcw, SearchX, Trash2, X } from 'lucide-react';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type AdminDocumentDto,
  type DocumentBulkAction,
  type DocumentStatus,
} from '@kaned/shared';
import { FileIcon } from '@/components/ui/FileBadge';
import { Avatar } from '@/components/ui/Avatar';
import { useUniversities } from '@/features/catalog/queries';
import { useToast } from '@/providers/ToastProvider';
import { http, toApiError } from '@/lib/api';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useBulkDocuments, useDeleteDocumentAdmin, useDocumentsAdmin, useUpdateDocumentAdmin } from './api';
import {
  ActionMenu,
  AdminHead,
  ConfirmDialog,
  EmptyBlock,
  EmptyRow,
  Pager,
  SearchBox,
  StatusBadge,
  TableCheck,
  TableSkeleton,
  useDebounced,
  type ConfirmState,
  type MenuItem,
} from './ui';
import { DocumentEditor } from './DocumentEditor';
import { useAdminCrumbs } from './AdminShell';

const PAGE_SIZE = 25;
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Status changes, viewing, editing and deleting a document — shared by every list of documents. */
export function useDocumentActions() {
  const toast = useToast();
  const update = useUpdateDocumentAdmin();
  const remove = useDeleteDocumentAdmin();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const setStatus = (d: AdminDocumentDto, status: DocumentStatus) =>
    update.mutate(
      { id: d.id, input: { status } },
      {
        onSuccess: () => toast.success(DOCUMENT_STATUS_LABELS[status].vi, d.title),
        onError: (e) => toast.error('Không cập nhật được', toApiError(e).message),
      },
    );

  const askDelete = (d: AdminDocumentDto) =>
    setConfirm({
      title: 'Xoá vĩnh viễn tài liệu này?',
      body: (
        <>
          <b>{d.title}</b> cùng đánh giá và lượt lưu của nó sẽ bị xoá và không khôi phục được. Muốn ẩn tạm thì dùng “Gỡ khỏi thư viện”.
        </>
      ),
      confirmLabel: 'Xoá vĩnh viễn',
      run: () =>
        remove.mutateAsync(d.id).then(
          () => toast.success('Đã xoá tài liệu', d.title),
          (e) => {
            toast.error('Không xoá được', toApiError(e).message);
            throw e;
          },
        ),
    });

  const menu = (d: AdminDocumentDto, onEdit: () => void): MenuItem[] => [
    { label: 'Sửa thông tin', icon: Pencil, onSelect: onEdit },
    { label: d.format === 'LINK' ? 'Mở liên kết' : 'Xem trên thư viện', icon: ExternalLink, onSelect: () => window.open(d.format === 'LINK' ? d.fileUrl : `/app/library/${d.id}`, '_blank', 'noopener') },
    'separator',
    { label: 'Duyệt đăng', icon: Check, onSelect: () => setStatus(d, 'PUBLISHED'), hidden: d.status === 'PUBLISHED' },
    { label: 'Từ chối', icon: X, onSelect: () => setStatus(d, 'REJECTED'), hidden: d.status !== 'PENDING' },
    { label: 'Gỡ khỏi thư viện', icon: EyeOff, onSelect: () => setStatus(d, 'REMOVED'), hidden: d.status !== 'PUBLISHED' },
    { label: 'Chuyển về chờ duyệt', icon: RotateCcw, onSelect: () => setStatus(d, 'PENDING'), hidden: d.status === 'PENDING' },
    'separator',
    { label: 'Xoá vĩnh viễn', icon: Trash2, danger: true, onSelect: () => askDelete(d) },
  ];

  return { menu, confirm, setConfirm };
}

export function DocumentsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as DocumentStatus | null) ?? undefined;
  const page = Number(params.get('page') ?? 1) || 1;
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q);
  const universityId = params.get('universityId') ?? '';
  const type = params.get('type') ?? '';
  const format = params.get('format') ?? '';
  const sort = (params.get('sort') as 'recent' | 'downloads' | 'title') ?? 'recent';
  useAdminCrumbs([{ label: 'Tài liệu' }]);

  const patch = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') ?? '') !== query) patch({ q: query || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const { data, isLoading, isFetching } = useDocumentsAdmin({
    status,
    q: query || undefined,
    universityId: universityId || undefined,
    type: (type || undefined) as never,
    format: (format || undefined) as never,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: universities = [] } = useUniversities();
  const bulk = useBulkDocuments();
  const { menu, confirm, setConfirm } = useDocumentActions();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminDocumentDto | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => setSelected(new Set()), [status, query, universityId, type, format, page]);
  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(true);
      patch({ new: undefined });
    }
    const id = params.get('open');
    if (id) {
      patch({ open: undefined });
      // The document may not be on this page of the list: fetch it.
      void http.get<AdminDocumentDto>(`/admin/documents/${id}`).then(
        (r) => setEditing(r.data),
        () => toast.error('Không mở được tài liệu', 'Có thể nó vừa bị xoá.'),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('new'), params.get('open')]);

  const items = data?.items ?? [];
  const counts = data?.statusCounts;
  const all = counts ? DOCUMENT_STATUSES.reduce((n, s) => n + counts[s], 0) : undefined;
  const allChecked = items.length > 0 && items.every((d) => selected.has(d.id));
  const someChecked = !allChecked && items.some((d) => selected.has(d.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const runBulk = (action: DocumentBulkAction) => {
    const ids = [...selected];
    const go = () =>
      bulk.mutateAsync({ ids, action }).then(
        (r) => {
          toast.success(`Đã cập nhật ${r.affected} tài liệu`);
          setSelected(new Set());
        },
        (e) => {
          toast.error('Không thực hiện được', toApiError(e).message);
          throw e;
        },
      );
    if (action === 'delete') {
      setConfirm({
        title: `Xoá vĩnh viễn ${ids.length} tài liệu?`,
        body: 'Tệp, đánh giá và lượt lưu của các tài liệu này sẽ mất hẳn. Muốn ẩn tạm thì dùng “Gỡ”.',
        confirmLabel: `Xoá ${ids.length} tài liệu`,
        run: go,
      });
    } else void go().catch(() => undefined);
  };

  const filtersOn = Boolean(query || universityId || type || format);
  const clearFilters = () => {
    setQ('');
    patch({ universityId: undefined, type: undefined, format: undefined, q: undefined });
  };
  const tabs = useMemo(() => [undefined, ...DOCUMENT_STATUSES] as Array<DocumentStatus | undefined>, []);

  return (
    <>
      <AdminHead
        title="Tài liệu"
        count={all}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <FilePlus2 className="ic" />
            Đăng tài liệu
          </button>
        }
      />

      <section className="adm-panel">
        <div className="adm-tabs" role="tablist" aria-label="Trạng thái">
          {tabs.map((s) => (
            <button key={s ?? 'all'} type="button" role="tab" className="adm-tab" aria-selected={status === s} onClick={() => patch({ status: s })}>
              {s ? DOCUMENT_STATUS_LABELS[s].vi : 'Tất cả'}
              <span className="n">{s ? (counts?.[s] ?? '–') : (all ?? '–')}</span>
            </button>
          ))}
        </div>
        <div className="adm-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm tiêu đề, mã môn, người đăng…" />
          <select className={cn('select', universityId && 'is-on')} value={universityId} onChange={(e) => patch({ universityId: e.target.value || undefined })} aria-label="Trường">
            <option value="">Mọi trường</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </select>
          <select className={cn('select', type && 'is-on')} value={type} onChange={(e) => patch({ type: e.target.value || undefined })} aria-label="Loại">
            <option value="">Mọi loại</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t].vi}
              </option>
            ))}
          </select>
          <select className={cn('select', format && 'is-on')} value={format} onChange={(e) => patch({ format: e.target.value || undefined })} aria-label="Định dạng">
            <option value="">Tệp và liên kết</option>
            <option value="LINK">Liên kết</option>
            <option value="PDF">PDF</option>
            <option value="DOCX">Word</option>
            <option value="PPTX">PowerPoint</option>
            <option value="XLSX">Excel</option>
          </select>
          {filtersOn && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Bỏ lọc
            </button>
          )}
          <span className="spacer" />
          <select className="select" value={sort} onChange={(e) => patch({ sort: e.target.value === 'recent' ? undefined : e.target.value })} aria-label="Sắp xếp">
            <option value="recent">Mới nhất</option>
            <option value="downloads">Tải nhiều nhất</option>
            <option value="title">Tên A–Z</option>
          </select>
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table is-clickable" aria-busy={isFetching}>
            <thead>
              <tr>
                <th className="w-check">
                  <TableCheck checked={allChecked} indeterminate={someChecked} label="Chọn tất cả trên trang" onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((d) => d.id)))} />
                </th>
                <th style={{ width: '46%' }}>Tài liệu</th>
                <th>Trạng thái</th>
                <th>Người đăng</th>
                <th className="num">Lượt tải</th>
                <th>Ngày đăng</th>
                <th className="w-menu" aria-label="Thao tác" />
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={7} />
            ) : !items.length ? (
              <EmptyRow cols={7}>
                {filtersOn ? (
                  <EmptyBlock icon={SearchX} title="Không có tài liệu khớp bộ lọc" text="Thử bỏ bớt bộ lọc hoặc tìm bằng từ khác." action={<button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>Bỏ lọc</button>} />
                ) : (
                  <EmptyBlock
                    icon={Files}
                    title={status ? `Không có tài liệu “${DOCUMENT_STATUS_LABELS[status].vi}”` : 'Chưa có tài liệu nào'}
                    text={status ? undefined : 'Đăng tài liệu đầu tiên — một tệp hoặc một liên kết.'}
                    action={
                      !status && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                          <FilePlus2 className="ic" />
                          Đăng tài liệu
                        </button>
                      )
                    }
                  />
                )}
              </EmptyRow>
            ) : (
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className={cn(selected.has(d.id) && 'is-selected')} onClick={() => setEditing(d)}>
                    <td className="w-check">
                      <TableCheck checked={selected.has(d.id)} onChange={() => toggle(d.id)} label={`Chọn ${d.title}`} />
                    </td>
                    <td style={{ maxWidth: 0 }}>
                      <div className="cell">
                        <FileIcon format={d.format} size="xs" />
                        <div>
                          <span className="cell-title" title={d.title}>
                            {d.title}
                          </span>
                          <span className="cell-sub">
                            <b>{d.subject.code}</b> · {d.university.code}
                            {d.folder ? ` · ${d.folder.name}` : ''} · {DOCUMENT_TYPE_LABELS[d.type].vi}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td>
                      <span className="cell-dot">
                        <Avatar name={d.uploader.name} src={d.uploader.avatarUrl} size="xs" />
                        <span className="truncate" style={{ maxWidth: 150 }}>
                          {d.uploader.name}
                        </span>
                      </span>
                    </td>
                    <td className="num">{d.format === 'LINK' ? <span className="muted">—</span> : fmtInt(d.downloads)}</td>
                    <td className="w-date">{shortDate(d.createdAt)}</td>
                    <td className="w-menu" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu label={`Thao tác cho ${d.title}`} items={menu(d, () => setEditing(d))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {data && data.total > 0 && <Pager page={page} totalPages={data.totalPages} total={data.total} unit="tài liệu" onPage={(p) => patch({ page: String(p) })} />}
      </section>

      {selected.size > 0 && (
        <div className="adm-bulk" role="toolbar" aria-label="Thao tác với tài liệu đã chọn">
          <b>Đã chọn {selected.size}</b>
          <button type="button" className="btn btn-ghost" onClick={() => runBulk('publish')} disabled={bulk.isPending}>
            <Check className="ic" />
            Duyệt đăng
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => runBulk('reject')} disabled={bulk.isPending}>
            Từ chối
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => runBulk('remove')} disabled={bulk.isPending}>
            <EyeOff className="ic" />
            Gỡ
          </button>
          <span className="sep" />
          <button type="button" className="btn btn-ghost is-danger" onClick={() => runBulk('delete')} disabled={bulk.isPending}>
            <Trash2 className="ic" />
            Xoá
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSelected(new Set())} aria-label="Bỏ chọn">
            <X className="ic" />
          </button>
        </div>
      )}

      <DocumentEditor open={creating || Boolean(editing)} doc={editing} onClose={() => (setCreating(false), setEditing(null))} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
