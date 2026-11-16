import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Download, ExternalLink, EyeOff, FilePlus2, Pencil, Trash2, X } from 'lucide-react';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type AdminDocumentDto,
  type DocumentBulkAction,
  type DocumentStatus,
} from '@kaned/shared';
import { FileBadge, FileIcon } from '@/components/ui/FileBadge';
import { EmptyState } from '@/components/ui/Feedback';
import { Avatar } from '@/components/ui/Avatar';
import { useUniversities } from '@/features/catalog/queries';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtDate, fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useBulkDocuments, useDeleteDocumentAdmin, useDocumentsAdmin, useUpdateDocumentAdmin } from './api';
import { AdminHead, ConfirmDialog, EmptyRow, Pager, SearchBox, StatusBadge, TableSkeleton, useDebounced, type ConfirmState } from './ui';
import { DocumentEditor } from './DocumentEditor';
import { useAdminCrumbs } from './AdminShell';

const PAGE_SIZE = 20;

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
  const update = useUpdateDocumentAdmin();
  const remove = useDeleteDocumentAdmin();
  const bulk = useBulkDocuments();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminDocumentDto | null>(null);
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  useEffect(() => setSelected(new Set()), [status, query, universityId, type, format, page]);
  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(true);
      patch({ new: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('new')]);
  useEffect(() => {
    const id = params.get('open');
    const found = id && data?.items.find((d) => d.id === id);
    if (found) {
      setEditing(found);
      patch({ open: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('open'), data]);

  const items = data?.items ?? [];
  const counts = data?.statusCounts;
  const all = counts ? DOCUMENT_STATUSES.reduce((n, s) => n + counts[s], 0) : undefined;
  const allChecked = items.length > 0 && items.every((d) => selected.has(d.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setStatus = (d: AdminDocumentDto, next: DocumentStatus) =>
    update.mutate(
      { id: d.id, input: { status: next } },
      {
        onSuccess: () => toast.success(`${DOCUMENT_STATUS_LABELS[next].vi}`, d.title),
        onError: (e) => toast.error('Không cập nhật được', toApiError(e).message),
      },
    );

  const runBulk = (action: DocumentBulkAction) => {
    const ids = [...selected];
    const go = () =>
      bulk.mutateAsync({ ids, action }).then(
        (r) => {
          toast.success(`Đã xử lý ${r.affected} tài liệu`);
          setSelected(new Set());
        },
        (e) => {
          toast.error('Không xử lý được', toApiError(e).message);
          throw e;
        },
      );
    if (action === 'delete') {
      setConfirm({
        title: `Xoá vĩnh viễn ${ids.length} tài liệu?`,
        body: 'Tệp, đánh giá và lượt lưu của các tài liệu này sẽ mất hẳn. Nếu chỉ muốn ẩn đi, dùng “Gỡ” thay vì xoá.',
        confirmLabel: 'Xoá vĩnh viễn',
        run: go,
      });
    } else void go().catch(() => undefined);
  };

  const askDelete = (d: AdminDocumentDto) =>
    setConfirm({
      title: 'Xoá tài liệu này?',
      body: (
        <>
          <b>{d.title}</b> cùng đánh giá và lượt lưu của nó sẽ bị xoá vĩnh viễn.
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

  const filtersOn = Boolean(query || universityId || type || format);
  const tabs = useMemo(() => [undefined, ...DOCUMENT_STATUSES] as Array<DocumentStatus | undefined>, []);

  return (
    <>
      <AdminHead
        title="Tài liệu"
        description="Duyệt, sửa, gỡ hoặc xoá mọi tài liệu và liên kết. Tài liệu chỉ hiện trong thư viện khi ở trạng thái “Đã đăng”."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <FilePlus2 className="ic ic-sm" />
            Đăng tài liệu
          </button>
        }
      />

      <section className="adm-panel">
        <div className="tabs adm-tabs" role="tablist">
          {tabs.map((s) => (
            <button key={s ?? 'all'} type="button" role="tab" aria-selected={status === s} onClick={() => patch({ status: s })}>
              {s ? DOCUMENT_STATUS_LABELS[s].vi : 'Tất cả'}
              <span className="count">{s ? (counts?.[s] ?? '–') : (all ?? '–')}</span>
            </button>
          ))}
        </div>
        <div className="adm-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm theo tiêu đề, mã môn, người đăng…" />
          <select className="select" value={universityId} onChange={(e) => patch({ universityId: e.target.value || undefined })} aria-label="Trường">
            <option value="">Mọi trường</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </select>
          <select className="select" value={type} onChange={(e) => patch({ type: e.target.value || undefined })} aria-label="Loại">
            <option value="">Mọi loại</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t].vi}
              </option>
            ))}
          </select>
          <select className="select" value={format} onChange={(e) => patch({ format: e.target.value || undefined })} aria-label="Định dạng">
            <option value="">Tệp và liên kết</option>
            <option value="LINK">Chỉ liên kết</option>
            <option value="PDF">PDF</option>
            <option value="DOCX">Word</option>
            <option value="PPTX">PowerPoint</option>
            <option value="XLSX">Excel</option>
          </select>
          <span className="spacer" />
          <select className="select" value={sort} onChange={(e) => patch({ sort: e.target.value === 'recent' ? undefined : e.target.value })} aria-label="Sắp xếp">
            <option value="recent">Mới nhất</option>
            <option value="downloads">Tải nhiều nhất</option>
            <option value="title">Theo tên A–Z</option>
          </select>
        </div>

        <div className="adm-table-wrap">
          <table className={cn('adm-table', !isLoading && 'rows-in')} aria-busy={isFetching}>
            <thead>
              <tr>
                <th className="w-check">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((d) => d.id)))}
                      aria-label="Chọn tất cả trên trang"
                    />
                    <span className="box">
                      <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  </label>
                </th>
                <th>Tài liệu</th>
                <th>Người đăng</th>
                <th>Trạng thái</th>
                <th className="num">Lượt tải</th>
                <th>Ngày đăng</th>
                <th className="w-acts" aria-label="Thao tác" />
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={7} />
            ) : !items.length ? (
              <EmptyRow cols={7}>
                <EmptyState
                  title={filtersOn ? 'Không có tài liệu khớp bộ lọc' : status ? `Không có tài liệu “${DOCUMENT_STATUS_LABELS[status].vi}”` : 'Chưa có tài liệu nào'}
                  description={filtersOn ? 'Thử bỏ bớt bộ lọc hoặc tìm bằng từ khác.' : 'Đăng tài liệu đầu tiên — một tệp hoặc một liên kết.'}
                  action={
                    filtersOn ? (
                      <button type="button" className="btn btn-secondary" onClick={() => (setQ(''), patch({ universityId: undefined, type: undefined, format: undefined, q: undefined }))}>
                        Bỏ bộ lọc
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                        <FilePlus2 className="ic ic-sm" />
                        Đăng tài liệu
                      </button>
                    )
                  }
                />
              </EmptyRow>
            ) : (
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className={cn(selected.has(d.id) && 'is-selected')}>
                    <td className="w-check">
                      <label className="check">
                        <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Chọn ${d.title}`} />
                        <span className="box">
                          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </span>
                      </label>
                    </td>
                    <td style={{ maxWidth: 440 }}>
                      <div className="cell-main">
                        <FileIcon format={d.format} size="sm" />
                        <div>
                          <button type="button" className="cell-title clamp-1" onClick={() => setEditing(d)} style={{ textAlign: 'left' }}>
                            {d.title}
                          </button>
                          <span className="cell-sub">
                            <b className="cell-code">{d.subject.code}</b> · {d.university.code} · {DOCUMENT_TYPE_LABELS[d.type].vi}
                            {d.term ? ` · ${d.term.name}` : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-main">
                        <Avatar name={d.uploader.name} src={d.uploader.avatarUrl} size="xs" />
                        <span className="clamp-1" style={{ fontSize: 13.5 }}>
                          {d.uploader.name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="num">
                      {d.format === 'LINK' ? <FileBadge format="LINK" linkUrl={d.linkUrl} /> : fmtInt(d.downloads)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13.5, color: 'var(--ink-2)' }}>{fmtDate(d.createdAt)}</td>
                    <td className="w-acts">
                      <div className="row-acts">
                        {d.status !== 'PUBLISHED' ? (
                          <button type="button" className="icon-btn" title="Duyệt đăng" aria-label="Duyệt đăng" onClick={() => setStatus(d, 'PUBLISHED')}>
                            <Check className="ic ic-sm" />
                          </button>
                        ) : (
                          <button type="button" className="icon-btn" title="Gỡ khỏi thư viện" aria-label="Gỡ khỏi thư viện" onClick={() => setStatus(d, 'REMOVED')}>
                            <EyeOff className="ic ic-sm" />
                          </button>
                        )}
                        <a className="icon-btn" href={d.format === 'LINK' ? d.fileUrl : `/app/library/${d.id}`} target="_blank" rel="noreferrer" title="Xem" aria-label="Xem">
                          {d.format === 'LINK' ? <ExternalLink className="ic ic-sm" /> : <Download className="ic ic-sm" />}
                        </a>
                        <button type="button" className="icon-btn" title="Sửa" aria-label="Sửa" onClick={() => setEditing(d)}>
                          <Pencil className="ic ic-sm" />
                        </button>
                        <button type="button" className="icon-btn is-danger" title="Xoá" aria-label="Xoá" onClick={() => askDelete(d)}>
                          <Trash2 className="ic ic-sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {data && <Pager page={page} totalPages={data.totalPages} total={data.total} unit="tài liệu" onPage={(p) => patch({ page: String(p) })} />}
      </section>

      {selected.size > 0 && (
        <div className="adm-bulk" role="toolbar" aria-label="Thao tác hàng loạt">
          <b>Đã chọn {selected.size}</b>
          <button type="button" className="btn btn-primary" onClick={() => runBulk('publish')} disabled={bulk.isPending}>
            <Check className="ic ic-sm" />
            Duyệt đăng
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => runBulk('reject')} disabled={bulk.isPending}>
            Từ chối
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => runBulk('remove')} disabled={bulk.isPending}>
            Gỡ
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => runBulk('delete')} disabled={bulk.isPending}>
            Xoá
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSelected(new Set())} aria-label="Bỏ chọn">
            <X className="ic ic-sm" />
          </button>
        </div>
      )}

      <DocumentEditor open={creating || Boolean(editing)} doc={editing} onClose={() => (setCreating(false), setEditing(null))} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
