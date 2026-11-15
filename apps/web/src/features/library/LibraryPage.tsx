import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, List, Search, Upload, X } from 'lucide-react';
import {
  DOCUMENT_SORTS,
  DOCUMENT_SORT_LABELS,
  DOCUMENT_TYPE_LABELS,
  SEMESTER_LABELS,
  type DocumentSort,
  type DocumentType,
  type Semester,
} from '@kaned/shared';
import { DocumentCard, DocumentCardSkeleton, DocumentRow } from '@/components/library/DocumentCard';
import { FilterPanel, FilterToggle } from '@/components/library/FilterPanel';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { useDocumentFacets, useDocuments, useToggleBookmark } from './queries';
import { useLibraryFilters } from './useLibraryFilters';
import { useSubjects, useUniversities } from '@/features/catalog/queries';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';

type View = 'grid' | 'list';

export function LibraryPage() {
  const { filters, setFilters, clear, activeCount } = useLibraryFilters();
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState<View>(() => (localStorage.getItem('kaned.library.view') as View) ?? 'grid');
  const [search, setSearch] = useState(filters.q ?? '');

  const { data, isLoading, isError, refetch, isFetching } = useDocuments(filters);
  const { data: facets } = useDocumentFacets(filters);
  const { data: universities = [] } = useUniversities();
  const { data: subjectPage } = useSubjects({ pageSize: 100 });
  const toggleBookmark = useToggleBookmark();

  useEffect(() => {
    localStorage.setItem('kaned.library.view', view);
  }, [view]);

  // Keep the box in step when the URL changes from somewhere else (chips, back).
  useEffect(() => setSearch(filters.q ?? ''), [filters.q]);

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (search === (filters.q ?? '')) return;
    const timer = setTimeout(() => setFilters({ ...filters, q: search || undefined, page: 1 }), 320);
    return () => clearTimeout(timer);
  }, [search, filters, setFilters]);

  const subjects = subjectPage?.items ?? [];
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const universityById = useMemo(() => new Map(universities.map((u) => [u.id, u])), [universities]);

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const page = filters.page ?? 1;

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  for (const id of filters.universityId ?? []) {
    chips.push({
      key: `u-${id}`,
      label: universityById.get(id)?.code ?? 'Trường',
      onRemove: () => setFilters({ ...filters, universityId: filters.universityId?.filter((x) => x !== id), page: 1 }),
    });
  }
  for (const id of filters.subjectId ?? []) {
    chips.push({
      key: `s-${id}`,
      label: subjectById.get(id)?.code ?? 'Môn',
      onRemove: () => setFilters({ ...filters, subjectId: filters.subjectId?.filter((x) => x !== id), page: 1 }),
    });
  }
  for (const type of filters.type ?? []) {
    chips.push({
      key: `t-${type}`,
      label: DOCUMENT_TYPE_LABELS[type as DocumentType].vi,
      onRemove: () => setFilters({ ...filters, type: filters.type?.filter((x) => x !== type), page: 1 }),
    });
  }
  for (const format of filters.format ?? []) {
    chips.push({
      key: `f-${format}`,
      label: format,
      onRemove: () => setFilters({ ...filters, format: filters.format?.filter((x) => x !== format), page: 1 }),
    });
  }
  for (const year of filters.year ?? []) {
    chips.push({
      key: `y-${year}`,
      label: `Năm ${year}`,
      onRemove: () => setFilters({ ...filters, year: filters.year?.filter((x) => x !== year), page: 1 }),
    });
  }
  for (const semester of filters.semester ?? []) {
    chips.push({
      key: `se-${semester}`,
      label: SEMESTER_LABELS[semester as Semester].vi,
      onRemove: () => setFilters({ ...filters, semester: filters.semester?.filter((x) => x !== semester), page: 1 }),
    });
  }
  if (filters.minRating) {
    chips.push({
      key: 'rating',
      label: `Từ ${filters.minRating} sao`,
      onRemove: () => setFilters({ ...filters, minRating: undefined, page: 1 }),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Thư viện học liệu"
        subtitle="Đề thi, slide, ghi chép và bài tập được sinh viên chia sẻ, phân loại theo trường và môn học."
        actions={
          <NavLink
            to="/app/upload"
            className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-brand px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <Upload className="size-4" aria-hidden />
            Tải lên tài liệu
          </NavLink>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[272px_minmax(0,1fr)]">
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onClear={() => {
            setSearch('');
            clear();
          }}
          universities={universities}
          subjects={subjects}
          facets={facets}
          resultCount={total}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
        />

        <div className="min-w-0">
          <div className="sticky top-[72px] z-20 -mx-1 mb-4 rounded-lg border border-line bg-paper/92 px-3 py-2.5 shadow-xs backdrop-blur">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="min-w-[220px] flex-1 basis-[260px]">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên tài liệu, mã môn, giảng viên…"
                  icon={<Search className="size-[18px]" />}
                  aria-label="Tìm trong thư viện"
                />
              </div>

              <FilterToggle count={activeCount} onClick={() => setPanelOpen(true)} />

              <Select
                sizeVariant="sm"
                aria-label="Sắp xếp"
                value={filters.sort ?? 'relevance'}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value as DocumentSort, page: 1 })}
                className="w-auto min-w-[168px] shrink-0"
              >
                {DOCUMENT_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {DOCUMENT_SORT_LABELS[sort]}
                  </option>
                ))}
              </Select>

              <div className="hidden rounded-[10px] border border-line-2 p-0.5 sm:flex" role="group" aria-label="Kiểu xem">
                {(
                  [
                    { id: 'grid' as View, icon: LayoutGrid, label: 'Dạng lưới' },
                    { id: 'list' as View, icon: List, label: 'Dạng danh sách' },
                  ] satisfies { id: View; icon: typeof LayoutGrid; label: string }[]
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setView(option.id)}
                    aria-pressed={view === option.id}
                    aria-label={option.label}
                    className={cn(
                      'grid size-8 place-items-center rounded-lg transition-colors',
                      view === option.id ? 'bg-brand text-white' : 'text-ink-3 hover:bg-sunk hover:text-ink',
                    )}
                  >
                    <option.icon className="size-[17px]" />
                  </button>
                ))}
              </div>
            </div>

            {chips.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 text-[12.5px] font-medium text-brand-700 transition-colors hover:bg-brand-100"
                  >
                    {chip.label}
                    <X className="size-3.5" aria-hidden />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    clear();
                  }}
                  className="ml-1 text-[12.5px] font-medium text-ink-3 underline hover:text-ink"
                >
                  Xoá hết
                </button>
              </div>
            )}
          </div>

          <p className="mb-3.5 text-[13.5px] text-ink-3" aria-live="polite">
            {isLoading ? (
              'Đang tải tài liệu…'
            ) : (
              <>
                <b className="tabular text-ink">{fmtInt(total)}</b> tài liệu
                {filters.q && (
                  <>
                    {' '}
                    cho <b className="text-ink">“{filters.q}”</b>
                  </>
                )}
                {isFetching && <span className="ml-2 text-ink-4">đang cập nhật…</span>}
              </>
            )}
          </p>

          {isError ? (
            <ErrorState
              title="Không tải được thư viện"
              description="Kiểm tra lại API ở cổng 4000 hoặc thử lại sau ít phút."
              onRetry={() => refetch()}
            />
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <DocumentCardSkeleton key={i} />
              ))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              icon={<Search className="size-7" />}
              title="Chưa có tài liệu nào khớp"
              description="Thử bỏ một vài bộ lọc, hoặc là người đầu tiên chia sẻ tài liệu cho môn này."
              action={
                <div className="flex flex-wrap justify-center gap-2.5">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch('');
                      clear();
                    }}
                  >
                    Xoá bộ lọc
                  </Button>
                  <NavLink
                    to="/app/upload"
                    className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    <Upload className="size-4" aria-hidden />
                    Tải lên tài liệu
                  </NavLink>
                </div>
              }
            />
          ) : view === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  onToggleBookmark={(id) => toggleBookmark.mutate(id)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.items.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  onToggleBookmark={(id) => toggleBookmark.mutate(id)}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="mt-7 flex items-center justify-center gap-2" aria-label="Phân trang">
              <IconButton
                label="Trang trước"
                disabled={page <= 1}
                onClick={() => setFilters({ ...filters, page: page - 1 })}
                className="border border-line-2"
              >
                <ChevronLeft className="size-[18px]" />
              </IconButton>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .map((n, index, list) => (
                  <span key={n} className="flex items-center gap-2">
                    {index > 0 && list[index - 1] !== n - 1 && <span className="text-ink-4">…</span>}
                    <button
                      type="button"
                      onClick={() => setFilters({ ...filters, page: n })}
                      aria-current={n === page ? 'page' : undefined}
                      className={cn(
                        'tabular grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-medium transition-colors',
                        n === page ? 'bg-brand text-white' : 'border border-line-2 text-ink-2 hover:bg-sunk',
                      )}
                    >
                      {n}
                    </button>
                  </span>
                ))}

              <IconButton
                label="Trang sau"
                disabled={page >= totalPages}
                onClick={() => setFilters({ ...filters, page: page + 1 })}
                className="border border-line-2"
              >
                <ChevronRight className="size-[18px]" />
              </IconButton>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
