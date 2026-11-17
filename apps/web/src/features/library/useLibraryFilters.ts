import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DOCUMENT_SORTS, type DocumentSort } from '@kaned/shared';
import type { LibraryFilters } from './queries';

const ARRAY_KEYS = ['universityId', 'facultyId', 'majorId', 'subjectId', 'type', 'format', 'semester', 'termId', 'period', 'tag'] as const;
const NUMBER_ARRAY_KEYS = ['year'] as const;

/**
 * The filter state lives in the URL, so a filtered view can be bookmarked,
 * shared with a classmate, and survives a refresh or the back button.
 */
export function useLibraryFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<LibraryFilters>(() => {
    const next: LibraryFilters = {};
    for (const key of ARRAY_KEYS) {
      const raw = searchParams.get(key);
      if (raw) (next as Record<string, unknown>)[key] = raw.split(',').filter(Boolean);
    }
    for (const key of NUMBER_ARRAY_KEYS) {
      const raw = searchParams.get(key);
      if (raw) {
        (next as Record<string, unknown>)[key] = raw
          .split(',')
          .map(Number)
          .filter((n) => Number.isFinite(n));
      }
    }
    const q = searchParams.get('q');
    if (q) next.q = q;

    const sort = searchParams.get('sort');
    if (sort && (DOCUMENT_SORTS as readonly string[]).includes(sort)) next.sort = sort as DocumentSort;

    const minRating = Number(searchParams.get('minRating'));
    if (Number.isFinite(minRating) && minRating > 0) next.minRating = minRating;

    const page = Number(searchParams.get('page'));
    next.page = Number.isFinite(page) && page > 0 ? page : 1;
    next.pageSize = 24;

    return next;
  }, [searchParams]);

  const setFilters = useCallback(
    (next: LibraryFilters) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === null || value === '') continue;
        if (key === 'pageSize') continue;
        if (key === 'page' && value === 1) continue;
        if (Array.isArray(value)) {
          if (value.length) params.set(key, value.join(','));
        } else {
          params.set(key, String(value));
        }
      }
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  const clear = useCallback(() => setSearchParams(new URLSearchParams(), { replace: true }), [setSearchParams]);

  const activeCount =
    (filters.universityId?.length ?? 0) +
    (filters.subjectId?.length ?? 0) +
    (filters.type?.length ?? 0) +
    (filters.format?.length ?? 0) +
    (filters.year?.length ?? 0) +
    (filters.semester?.length ?? 0) +
    (filters.termId?.length ?? 0) +
    (filters.period?.length ?? 0) +
    (filters.minRating ? 1 : 0);

  return { filters, setFilters, clear, activeCount };
}
