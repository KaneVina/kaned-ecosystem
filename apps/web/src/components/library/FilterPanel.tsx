import { useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  FILE_FORMATS,
  FILE_FORMAT_COLORS,
  SEMESTERS,
  SEMESTER_LABELS,
  STUDY_YEARS,
} from '@kaned/shared';
import type { UniversityDto, SubjectSummaryDto } from '@kaned/shared';
import { Checkbox, Input } from '@/components/ui/Field';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { LibraryFilters } from '@/features/library/queries';

export interface FacetCounts {
  type: Record<string, number>;
  format: Record<string, number>;
  universityId: Record<string, number>;
  subjectId: Record<string, number>;
}

interface Props {
  filters: LibraryFilters;
  onChange: (next: LibraryFilters) => void;
  onClear: () => void;
  universities: UniversityDto[];
  subjects: SubjectSummaryDto[];
  facets?: FacetCounts;
  resultCount: number;
  open: boolean;
  onClose: () => void;
}

function Group({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line px-4 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-3.5 text-[13.5px] font-semibold"
      >
        {title}
        {count ? (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1.5 text-[11px] text-white">
            {count}
          </span>
        ) : null}
        <ChevronDown className={cn('ml-auto size-4 text-ink-3 transition-transform', !open && '-rotate-90')} aria-hidden />
      </button>
      <div className={cn('grid transition-[grid-template-rows] duration-300', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className={cn('overflow-hidden', open && 'pb-3')}>{children}</div>
      </div>
    </div>
  );
}

/** Toggles one value inside an array filter, dropping the key when it empties. */
function toggle<T extends string>(list: T[] | undefined, value: T): T[] | undefined {
  const set = new Set<T>(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  const next = [...set];
  return next.length ? next : undefined;
}

export function FilterPanel({
  filters,
  onChange,
  onClear,
  universities,
  subjects,
  facets,
  resultCount,
  open,
  onClose,
}: Props) {
  const [subjectQuery, setSubjectQuery] = useState('');

  const activeCount =
    (filters.universityId?.length ?? 0) +
    (filters.subjectId?.length ?? 0) +
    (filters.type?.length ?? 0) +
    (filters.format?.length ?? 0) +
    (filters.year?.length ?? 0) +
    (filters.semester?.length ?? 0) +
    (filters.minRating ? 1 : 0);

  const visibleSubjects = subjects.filter((s) =>
    subjectQuery
      ? `${s.code} ${s.name} ${s.nameVi}`.toLowerCase().includes(subjectQuery.toLowerCase())
      : true,
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={onClose} aria-hidden />}

      <aside
        aria-label="Bộ lọc"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(340px,90vw)] flex-col bg-paper shadow-lg transition-transform duration-300',
          'lg:sticky lg:top-[88px] lg:z-0 lg:w-auto lg:max-h-[calc(100vh-7rem)] lg:translate-x-0 lg:rounded-lg lg:border lg:border-line lg:shadow-xs',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
          <h2 className="text-[15px] font-semibold">Bộ lọc</h2>
          <button
            type="button"
            onClick={onClear}
            disabled={!activeCount && !filters.q}
            className="text-[13px] font-medium text-brand disabled:text-ink-4"
          >
            Xoá tất cả
          </button>
          <IconButton label="Đóng bộ lọc" onClick={onClose} className="lg:hidden">
            <X className="size-[18px]" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Group title="Trường" count={filters.universityId?.length}>
            {universities.map((u) => (
              <Checkbox
                key={u.id}
                label={<span title={u.name}>{u.name}</span>}
                count={facets?.universityId[u.id] ?? 0}
                checked={filters.universityId?.includes(u.id) ?? false}
                onChange={() => onChange({ ...filters, universityId: toggle(filters.universityId, u.id), page: 1 })}
              />
            ))}
          </Group>

          <Group title="Năm học" count={filters.year?.length}>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {STUDY_YEARS.map((year) => {
                const active = filters.year?.includes(year) ?? false;
                return (
                  <button
                    key={year}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      const set = new Set(filters.year ?? []);
                      if (set.has(year)) set.delete(year);
                      else set.add(year);
                      const next = [...set];
                      onChange({ ...filters, year: next.length ? next : undefined, page: 1 });
                    }}
                    className={cn(
                      'h-8 rounded-full border px-3 text-[13px] font-medium transition-colors',
                      active
                        ? 'border-brand bg-brand text-white'
                        : 'border-line-2 bg-paper text-ink-2 hover:border-brand-200 hover:text-ink',
                    )}
                  >
                    Năm {year}
                  </button>
                );
              })}
            </div>
          </Group>

          <Group title="Học kỳ" count={filters.semester?.length}>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SEMESTERS.map((s) => {
                const active = filters.semester?.includes(s) ?? false;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ ...filters, semester: toggle(filters.semester, s), page: 1 })}
                    className={cn(
                      'h-8 rounded-full border px-3 text-[13px] font-medium transition-colors',
                      active
                        ? 'border-brand bg-brand text-white'
                        : 'border-line-2 bg-paper text-ink-2 hover:border-brand-200 hover:text-ink',
                    )}
                  >
                    {SEMESTER_LABELS[s].vi}
                  </button>
                );
              })}
            </div>
          </Group>

          <Group title="Môn học" count={filters.subjectId?.length}>
            <Input
              sizeVariant="sm"
              placeholder="Tìm môn học"
              value={subjectQuery}
              onChange={(e) => setSubjectQuery(e.target.value)}
              icon={<Search className="size-4" />}
              className="mb-1"
            />
            <div className="-mr-2 max-h-56 overflow-y-auto pr-2">
              {visibleSubjects.map((s) => (
                <Checkbox
                  key={s.id}
                  label={
                    <span title={`${s.code} — ${s.name}`}>
                      <span className="font-medium">{s.code}</span> <span className="text-ink-3">{s.name}</span>
                    </span>
                  }
                  count={facets?.subjectId[s.id] ?? 0}
                  checked={filters.subjectId?.includes(s.id) ?? false}
                  onChange={() => onChange({ ...filters, subjectId: toggle(filters.subjectId, s.id), page: 1 })}
                />
              ))}
              {!visibleSubjects.length && <p className="py-2 text-[13px] text-ink-3">Không tìm thấy môn học phù hợp.</p>}
            </div>
          </Group>

          <Group title="Loại tài liệu" count={filters.type?.length}>
            {DOCUMENT_TYPES.map((type) => (
              <Checkbox
                key={type}
                label={DOCUMENT_TYPE_LABELS[type].vi}
                count={facets?.type[type] ?? 0}
                checked={filters.type?.includes(type) ?? false}
                onChange={() => onChange({ ...filters, type: toggle(filters.type, type), page: 1 })}
              />
            ))}
          </Group>

          <Group title="Định dạng" count={filters.format?.length}>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {FILE_FORMATS.map((format) => {
                const active = filters.format?.includes(format) ?? false;
                return (
                  <button
                    key={format}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ ...filters, format: toggle(filters.format, format), page: 1 })}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                      active
                        ? 'border-brand bg-brand text-white'
                        : 'border-line-2 bg-paper text-ink-2 hover:border-brand-200',
                    )}
                  >
                    <span
                      className="size-2 rounded-[2px]"
                      style={{ background: active ? '#fff' : FILE_FORMAT_COLORS[format] }}
                      aria-hidden
                    />
                    {format}
                    <span className="tabular text-[11.5px] opacity-70">{facets?.format[format] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </Group>

          <Group title="Đánh giá" count={filters.minRating ? 1 : 0}>
            <div className="space-y-0.5 pt-1" role="radiogroup" aria-label="Đánh giá tối thiểu">
              {[0, 4, 4.5].map((value) => (
                <label key={value} className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm text-ink-2">
                  <input
                    type="radio"
                    name="minRating"
                    checked={(filters.minRating ?? 0) === value}
                    onChange={() => onChange({ ...filters, minRating: value || undefined, page: 1 })}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {value ? `Từ ${value} sao trở lên` : 'Tất cả đánh giá'}
                </label>
              ))}
            </div>
          </Group>
        </div>

        <div className="border-t border-line p-3 lg:hidden">
          <Button block onClick={onClose}>
            Xem {resultCount} kết quả
          </Button>
        </div>
      </aside>
    </>
  );
}

export function FilterToggle({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} className="lg:hidden" icon={<SlidersHorizontal className="size-4" />}>
      Bộ lọc
      {count > 0 && (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1.5 text-[11px] text-white">
          {count}
        </span>
      )}
    </Button>
  );
}
