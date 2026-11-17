import { useQuery } from '@tanstack/react-query';
import type { DeckDetailDto, DeckListQuery, DeckProgress, DeckProgressSummary, DeckSummaryDto } from '@kaned/shared';
import { BASE_URL, getAccessToken, http } from '@/lib/api';

export const deckKeys = {
  all: ['decks'] as const,
  list: (q: DeckListQuery) => ['decks', 'list', q] as const,
  one: (id: string) => ['decks', 'one', id] as const,
};

export const useDecks = (q: DeckListQuery = {}) =>
  useQuery({
    queryKey: deckKeys.list(q),
    queryFn: async () => (await http.get<DeckSummaryDto[]>('/decks', { params: q })).data,
    staleTime: 60_000,
  });

/** The whole deck and my saved progress. Content is large and rarely changes, so it is kept a while. */
export const useDeck = (id: string | undefined) =>
  useQuery({
    queryKey: deckKeys.one(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => (await http.get<DeckDetailDto>(`/decks/${id}`)).data,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

export const saveDeckProgress = async (id: string, state: DeckProgress) =>
  (await http.put<DeckProgressSummary>(`/decks/${id}/progress`, { state })).data;

/** For the page being closed: a request the browser finishes on its own. */
export function saveDeckProgressOnExit(id: string, state: DeckProgress) {
  const token = getAccessToken();
  try {
    void fetch(`${BASE_URL}/api/decks/${id}/progress`, {
      method: 'PUT',
      keepalive: true,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ state }),
    });
  } catch {
    /* nothing more can be done while the page closes */
  }
}
