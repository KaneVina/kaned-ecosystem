import { foldVi, type DeckSummaryDto } from '@kaned/shared';
import type { LibraryFilters } from './queries';

/**
 * Flashcard decks live in their own table, but in the library they are one more
 * kind of document. "FLASHCARD" is a pseudo type kept in the URL like the real ones;
 * it never reaches the documents API.
 */
export const FLASHCARD = 'FLASHCARD';

export function splitDeckFilter(filters: LibraryFilters) {
  const types = (filters.type ?? []) as string[];
  const realTypes = types.filter((t) => t !== FLASHCARD);
  const picked = types.includes(FLASHCARD);
  // Decks have no year, term, block, file format or rating, so those filters leave them out.
  const docOnly = Boolean(filters.year?.length || filters.semester?.length || filters.termId?.length || filters.period?.length || filters.format?.length || filters.minRating || filters.uploaderId || filters.bookmarkedBy || filters.folderId || filters.facultyId?.length || filters.majorId?.length);
  return {
    docFilters: { ...filters, type: realTypes.length ? (realTypes as LibraryFilters['type']) : undefined } as LibraryFilters,
    wantDecks: !docOnly && (picked || !types.length),
    /** Only decks were asked for: skip the documents query. */
    onlyDecks: picked && !realTypes.length,
    docOnly,
  };
}

/** Decks that match the school, subject and search box (other filters don't apply to them). */
export function matchDecks(decks: DeckSummaryDto[], filters: LibraryFilters) {
  const terms = foldVi((filters.q ?? '').trim()).split(/\s+/).filter(Boolean);
  return decks.filter((d) => {
    if (filters.universityId?.length && !filters.universityId.includes(d.subject.university.id)) return false;
    if (filters.subjectId?.length && !filters.subjectId.includes(d.subject.id)) return false;
    const hay = foldVi(`${d.title} ${d.subject.code} ${d.subject.nameVi} ${d.description ?? ''} thẻ ghi nhớ flashcard bộ đề ôn thi`);
    return terms.every((t) => hay.includes(t));
  });
}
