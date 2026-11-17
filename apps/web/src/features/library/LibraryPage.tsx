import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, List, Search, SlidersHorizontal } from 'lucide-react';
import {
  DOCUMENT_SORTS,
  DOCUMENT_SORT_LABELS,
  DOCUMENT_TYPE_LABELS,
  SEMESTER_LABELS,
  type DocumentSort,
  type DocumentSummaryDto,
  type DocumentType,
  type Semester,
} from '@kaned/shared';
import { DocCard, DocCardSkeleton, DocRow, DocRowSkeleton } from '@/components/library/DocCard';
import { Filters } from '@/components/library/Filters';
import { QuickPreview } from '@/components/library/QuickPreview';
import { Chip } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { PageHead } from '@/components/ui/Panel';
import { useDocumentFacets, useDocuments, useDownload, useToggleBookmark } from './queries';
import { useLibraryFilters } from './useLibraryFilters';
import { useSubjects, useTerms, useUniversities } from '@/features/catalog/queries';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtInt } from '@/lib/format';

type View = 'grid' | 'list';

function readView(): View {
  try {
    return (localStorage.getItem('kaned.library.view') as View) || 'grid';
  } catch {
    return 'grid';
  }
}

export function LibraryPage() {
  const { filters, setFilters, clear, activeCount } = useLibraryFilters();
  const toast = useToast();
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState<View>(readView);
  const [search, setSearch] = useState(filters.q ?? '');
  const [preview, setPreview] = useState<DocumentSummaryDto | null>(null);

  const sort = filters.sort ?? (filters.q ? 'relevance' : 'downloads');
  const { data, isLoading, isError, refetch, isFetching } = useDocuments({ ...filters, sort });
  const { data: facets } = useDocumentFacets(filters);
  const { data: universities = [] } = useUniversities();
  const { data: subjectPage } = useSubjects({ pageSize: 200 });
  const toggleBookmark = useToggleBookmark();
  const download = useDownload();

  useEffect(() => {
    try {
      localStorage.setItem('kaned.library.view', view);
    } catch {
      /* storage unavailable */
    }
  }, [view]);

  useEffect(() => setSearch(filters.q ?? ''), [filters.q]);

  // Results follow the search box as you type, a beat after the last key.
  useEffect(() => {
    if (search === (filters.q ?? '')) return;
    const t = setTimeout(() => setFilters({ ...filters, q: search || undefined, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [search, filters, setFilters]);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', panelOpen);
  }, [panelOpen]);

  const subjects = subjectPage?.items ?? [];
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const uniById = useMemo(() => new Map(universities.map((u) => [u.id, u])), [universities]);
  const { data: schoolTerms = [] } = useTerms(filters.universityId?.length === 1 ? filters.universityId[0] : undefined);
  const termById = useMemo(() => new Map(schoolTerms.map((t) => [t.id, t.name])), [schoolTerms]);

  // Keep an open preview in step with bookmark changes.
  const previewDoc = preview ? (data?.items.find((d) => d.id === preview.id) ?? preview) : null;

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const page = filters.page ?? 1;

  const startDownload = (doc: DocumentSummaryDto) =>
    download.mutate(doc.id, {
      onSuccess: ({ fileUrl }) => {
        window.open(fileUrl, '_blank', 'noopener');
        toast.success('Đang tải xuống', doc.title);
      },
      onError: (e) => toast.error('Không tải được', toApiError(e).message),
    });

  const without = <T,>(list: T[] | undefined, v: T) => {
    const next = (list ?? []).filter((x) => x !== v);
    return next.length ? next : undefined;
  };
  const chips: Array<{ key: string; k: string; label: string; remove: () => void }> = [];
  if (filters.q)
    chips.push({
      key: 'q',
      k: 'Tìm',
      label: `“${filters.q}”`,
      remove: () => {
        setSearch('');
        setFilters({ ...filters, q: undefined, page: 1 });
      },
    });
  for (const id of filters.universityId ?? [])
    chips.push({ key: `u${id}`, k: 'Trường', label: uniById.get(id)?.code ?? '…', remove: () => setFilters({ ...filters, universityId: without(filters.universityId, id), termId: undefined, period: undefined, page: 1 }) });
  for (const y of filters.year ?? [])
    chips.push({ key: `y${y}`, k: 'Năm', label: String(y), remove: () => setFilters({ ...filters, year: without(filters.year, y), page: 1 }) });
  for (const id of filters.termId ?? [])
    chips.push({ key: `t${id}`, k: 'Kỳ học', label: termById.get(id) ?? '…', remove: () => setFilters({ ...filters, termId: without(filters.termId, id), page: 1 }) });
  for (const p of filters.period ?? [])
    chips.push({ key: `p${p}`, k: 'Block', label: p, remove: () => setFilters({ ...filters, period: without(filters.period, p), page: 1 }) });
  for (const s of filters.semester ?? [])
    chips.push({ key: `s${s}`, k: 'Học kỳ', label: SEMESTER_LABELS[s as Semester].vi, remove: () => setFilters({ ...filters, semester: without(filters.semester, s), page: 1 }) });
  for (const id of filters.subjectId ?? [])
    chips.push({ key: `m${id}`, k: 'Môn', label: subjectById.get(id)?.code ?? '…', remove: () => setFilters({ ...filters, subjectId: without(filters.subjectId, id), page: 1 }) });
  for (const t of filters.type ?? [])
    chips.push({ key: `t${t}`, k: 'Loại', label: DOCUMENT_TYPE_LABELS[t as DocumentType].vi, remove: () => setFilters({ ...filters, type: without(filters.type, t), page: 1 }) });
  for (const f of filters.format ?? [])
    chips.push({ key: `f${f}`, k: 'Định dạng', label: f === 'LINK' ? 'Liên kết' : f, remove: () => setFilters({ ...filters, format: without(filters.format, f), page: 1 }) });
  if (filters.minRating)
    chips.push({ key: 'r', k: 'Đánh giá', label: `${filters.minRating}+`, remove: () => setFilters({ ...filters, minRating: undefined, page: 1 }) });

  const clearAll = () => {
    setSearch('');
    clear();
  };

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Thư viện' }]}
        title="Thư viện học liệu"
        description={`Ghi chép, slide, đề thi và báo cáo từ ${universities.length || 'nhiều'} trường. Kết quả cập nhật ngay khi bạn gõ và lọc.`}
      >
        <div className="ex-search">
          <div className="input-group ex-search-box">
            <Search className="ic" />
            <label htmlFor="lib-q" className="sr-only">
              Tìm tài liệu
            </label>
            <input
              id="lib-q"
              className="input input-lg"
              type="search"
              placeholder="Tìm theo tên tài liệu, mã môn, tên môn, trường hoặc người đăng"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            <kbd className="ex-kbd">/</kbd>
          </div>
        </div>
      </PageHead>

      <div className="container explore-layout">
        <Filters
          filters={filters}
          onChange={setFilters}
          onClear={clearAll}
          universities={universities}
          subjects={subjects}
          facets={facets}
          resultCount={total}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          activeCount={activeCount}
        />

        <section className="results" aria-label="Kết quả">
          <div className="results-bar">
            <button type="button" className="btn btn-secondary btn-sm filters-toggle" onClick={() => setPanelOpen(true)}>
              <SlidersHorizontal className="ic ic-sm" />
              Bộ lọc
              <span className="filters-n">{activeCount || ''}</span>
            </button>
            <p className="results-count" aria-live="polite">
              {isLoading ? (
                'Đang tải…'
              ) : total ? (
                <>
                  <b>{fmtInt(total)}</b> tài liệu{filters.q ? ` cho “${filters.q}”` : ''}
                </>
              ) : (
                `Không có tài liệu${filters.q ? ` cho “${filters.q}”` : ''}`
              )}
              {isFetching && !isLoading && <span className="kbd-hint"> · đang cập nhật</span>}
            </p>
            <span className="spacer" />
            <label className="sort">
              <span>Sắp xếp</span>
              <select
                className="select select-sm"
                value={sort}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value as DocumentSort, page: 1 })}
              >
                {DOCUMENT_SORTS.filter((s) => s !== 'relevance' || filters.q).map((s) => (
                  <option key={s} value={s}>
                    {DOCUMENT_SORT_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <div className="seg" role="group" aria-label="Kiểu hiển thị">
              <button type="button" aria-pressed={view === 'grid'} aria-label="Dạng lưới" onClick={() => setView('grid')}>
                <LayoutGrid className="ic ic-sm" />
              </button>
              <button type="button" aria-pressed={view === 'list'} aria-label="Dạng danh sách" onClick={() => setView('list')}>
                <List className="ic ic-sm" />
              </button>
            </div>
          </div>

          <div className={chips.length ? 'active-chips has' : 'active-chips'}>
            {chips.map((c) => (
              <Chip key={c.key} k={c.k} onRemove={c.remove}>
                {c.label}
              </Chip>
            ))}
            {chips.length > 0 && (
              <button type="button" className="link chip-clear" onClick={clearAll}>
                Xoá tất cả
              </button>
            )}
          </div>

          {isError ? (
            <ErrorState title="Không tải được thư viện" onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className={view === 'grid' ? 'grid-docs grid-3' : 'list-docs'} aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (view === 'grid' ? <DocCardSkeleton key={i} /> : <DocRowSkeleton key={i} />))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              title={filters.q ? `Không có gì khớp “${filters.q}” với bộ lọc này` : 'Không có tài liệu nào khớp bộ lọc'}
              description={
                activeCount
                  ? 'Thử bỏ bớt một vài bộ lọc. Năm học và học kỳ là hai bộ lọc thu hẹp kết quả nhiều nhất.'
                  : 'Kiểm tra lại chính tả, hoặc tìm theo mã môn (ví dụ CSD201) hay tên môn.'
              }
              action={
                <>
                  {(activeCount > 0 || filters.q) && (
                    <button type="button" className="btn btn-primary" onClick={clearAll}>
                      Xoá tìm kiếm và bộ lọc
                    </button>
                  )}
                  <Link
                    to={filters.subjectId?.length === 1 ? `/app/upload?subject=${filters.subjectId[0]}${filters.universityId?.length === 1 ? `&university=${filters.universityId[0]}` : ""}` : "/app/upload"}
                    className="btn btn-secondary"
                  >
                    Chia sẻ tài liệu đầu tiên
                  </Link>
                </>
              }
            />
          ) : (
            <div className={view === 'grid' ? 'grid-docs grid-3' : 'list-docs'}>
              {data.items.map((doc) =>
                view === 'grid' ? (
                  <DocCard key={doc.id} doc={doc} onToggleBookmark={(id) => toggleBookmark.mutate(id)} onPreview={setPreview} />
                ) : (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    onToggleBookmark={(id) => toggleBookmark.mutate(id)}
                    onPreview={setPreview}
                    onDownload={startDownload}
                  />
                ),
              )}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="pager" aria-label="Phân trang">
              <button type="button" disabled={page <= 1} onClick={() => setFilters({ ...filters, page: page - 1 })} aria-label="Trang trước">
                <ChevronLeft className="ic ic-sm" />
              </button>
              {pageNumbers.map((p, i) => (
                <span key={p} style={{ display: 'contents' }}>
                  {i > 0 && pageNumbers[i - 1] !== p - 1 && <span className="gap">…</span>}
                  <button type="button" aria-current={p === page ? 'page' : undefined} onClick={() => setFilters({ ...filters, page: p })}>
                    {p}
                  </button>
                </span>
              ))}
              <button type="button" disabled={page >= totalPages} onClick={() => setFilters({ ...filters, page: page + 1 })} aria-label="Trang sau">
                <ChevronRight className="ic ic-sm" />
              </button>
            </nav>
          )}
        </section>
      </div>

      <QuickPreview
        doc={previewDoc}
        onClose={() => setPreview(null)}
        onToggleBookmark={(id) => toggleBookmark.mutate(id)}
        onDownload={startDownload}
        downloading={download.isPending}
      />
    </>
  );
}
