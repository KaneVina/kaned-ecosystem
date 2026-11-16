import { useState, type ReactNode } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  FILE_FORMATS,
  FILE_FORMAT_LABELS,
  SEMESTERS,
  SEMESTER_LABELS,
  STUDY_YEARS,
} from '@kaned/shared';
import type { SubjectSummaryDto, UniversityDto } from '@kaned/shared';
import { Checkbox } from '@/components/ui/Field';
import { Stars } from '@/components/ui/Stars';
import type { LibraryFilters } from '@/features/library/queries';
import { cn } from '@/lib/cn';

export interface FacetCounts {
  type: Record<string, number>;
  format: Record<string, number>;
  universityId: Record<string, number>;
  subjectId: Record<string, number>;
}

function Group({ title, count, open: initial = true, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className={cn('fg', !open && 'collapsed')}>
      <button type="button" className="fg-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {title}
        <span className={cn('fg-n', count ? 'on' : undefined)}>{count || ''}</span>
        <ChevronDown className="ic ic-sm fg-chev" />
      </button>
      <div className="fg-body">
        <div className="fg-inner">{children}</div>
      </div>
    </div>
  );
}

function toggle<T extends string | number>(list: T[] | undefined, value: T): T[] | undefined {
  const set = new Set<T>(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  const next = [...set];
  return next.length ? next : undefined;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function Filters({
  filters,
  onChange,
  onClear,
  universities,
  subjects,
  facets,
  resultCount,
  open,
  onClose,
  activeCount,
}: {
  filters: LibraryFilters;
  onChange: (next: LibraryFilters) => void;
  onClear: () => void;
  universities: UniversityDto[];
  subjects: SubjectSummaryDto[];
  facets?: FacetCounts;
  resultCount: number;
  open: boolean;
  onClose: () => void;
  activeCount: number;
}) {
  const [subjectQuery, setSubjectQuery] = useState('');
  const set = (patch: Partial<LibraryFilters>) => onChange({ ...filters, ...patch, page: 1 });
  const visibleSubjects = subjects.filter((s) =>
    subjectQuery ? fold(`${s.code} ${s.name} ${s.nameVi}`).includes(fold(subjectQuery)) : true,
  );
  const n = (bucket: Record<string, number> | undefined, key: string) => bucket?.[key] ?? 0;

  return (
    <>
      <aside className={cn('filters', open && 'open')} aria-label="Bộ lọc">
        <div className="filters-head">
          <h2 className="t-h4">Bộ lọc</h2>
          <button type="button" className="link" onClick={onClear} disabled={!activeCount && !filters.q}>
            Xoá tất cả
          </button>
          <button type="button" className="icon-btn filters-close" aria-label="Đóng bộ lọc" onClick={onClose}>
            <X className="ic" />
          </button>
        </div>

        <div className="filters-scroll">
          <Group title="Trường" count={filters.universityId?.length}>
            {universities.map((u) => (
              <Checkbox
                key={u.id}
                label={<span className="clamp-1" title={u.name}>{u.name}</span>}
                count={n(facets?.universityId, u.id)}
                zero={n(facets?.universityId, u.id) === 0}
                checked={filters.universityId?.includes(u.id) ?? false}
                onChange={() => set({ universityId: toggle(filters.universityId, u.id) })}
              />
            ))}
          </Group>

          <Group title="Năm học" count={filters.year?.length}>
            <div className="pills">
              {STUDY_YEARS.map((y) => (
                <button
                  key={y}
                  type="button"
                  className="pill"
                  aria-pressed={filters.year?.includes(y) ?? false}
                  onClick={() => set({ year: toggle(filters.year, y) })}
                >
                  Năm {y}
                </button>
              ))}
            </div>
          </Group>

          <Group title="Học kỳ" count={filters.semester?.length}>
            <div className="pills">
              {SEMESTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="pill"
                  aria-pressed={filters.semester?.includes(s) ?? false}
                  onClick={() => set({ semester: toggle(filters.semester, s) })}
                >
                  {SEMESTER_LABELS[s].vi}
                </button>
              ))}
            </div>
          </Group>

          <Group title="Môn học" count={filters.subjectId?.length}>
            <div className="input-group fg-search">
              <Search className="ic ic-sm" />
              <input
                className="input input-sm"
                type="search"
                placeholder="Tìm môn học"
                aria-label="Tìm môn học"
                value={subjectQuery}
                onChange={(e) => setSubjectQuery(e.target.value)}
              />
            </div>
            <div className="subj-list">
              {visibleSubjects.map((s) => (
                <Checkbox
                  key={s.id}
                  label={
                    <span className="clamp-1" title={`${s.code} — ${s.nameVi}`}>
                      <b className="subj-code">{s.code}</b> {s.nameVi}
                    </span>
                  }
                  count={n(facets?.subjectId, s.id)}
                  zero={n(facets?.subjectId, s.id) === 0}
                  checked={filters.subjectId?.includes(s.id) ?? false}
                  onChange={() => set({ subjectId: toggle(filters.subjectId, s.id) })}
                />
              ))}
              {!visibleSubjects.length && <p className="t-small" style={{ padding: '6px 0' }}>Không có môn nào khớp.</p>}
            </div>
          </Group>

          <Group title="Loại tài liệu" count={filters.type?.length}>
            {DOCUMENT_TYPES.map((t) => (
              <Checkbox
                key={t}
                label={DOCUMENT_TYPE_LABELS[t].vi}
                count={n(facets?.type, t)}
                zero={n(facets?.type, t) === 0}
                checked={filters.type?.includes(t) ?? false}
                onChange={() => set({ type: toggle(filters.type, t) })}
              />
            ))}
          </Group>

          <Group title="Định dạng" count={filters.format?.length}>
            <div className="pills">
              {FILE_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={cn('pill pill-ft', n(facets?.format, f) === 0 && !filters.format?.includes(f) && 'is-zero')}
                  aria-pressed={filters.format?.includes(f) ?? false}
                  onClick={() => set({ format: toggle(filters.format, f) })}
                >
                  <i className={`fdot fdot-${f.toLowerCase()}`} />
                  {f === 'LINK' ? FILE_FORMAT_LABELS.LINK : f}
                  <span className="count">{n(facets?.format, f)}</span>
                </button>
              ))}
            </div>
          </Group>

          <Group title="Đánh giá" count={filters.minRating ? 1 : 0}>
            <div role="radiogroup" aria-label="Đánh giá tối thiểu">
              {([[0, 'Mọi đánh giá'], [4.5, 'Từ 4,5 trở lên'], [4, 'Từ 4,0 trở lên']] as const).map(([v, l]) => (
                <Checkbox
                  key={v}
                  type="radio"
                  name="lib-rating"
                  label={
                    <>
                      {v ? <Stars value={v} small /> : null}
                      {l}
                    </>
                  }
                  checked={(filters.minRating ?? 0) === v}
                  onChange={() => set({ minRating: v || undefined })}
                />
              ))}
            </div>
          </Group>
        </div>

        <div className="filters-foot">
          <button type="button" className="btn btn-secondary" onClick={onClear}>
            Xoá tất cả
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Xem {resultCount} kết quả
          </button>
        </div>
      </aside>
      <div className={cn('filters-scrim', open && 'open')} onClick={onClose} />
    </>
  );
}
