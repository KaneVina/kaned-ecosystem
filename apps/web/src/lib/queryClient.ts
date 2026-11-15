import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        // Never retry a request the server already rejected on purpose.
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  me: ['auth', 'me'] as const,
  authConfig: ['auth', 'config'] as const,
  universities: ['catalog', 'universities'] as const,
  faculties: (universityId?: string) => ['catalog', 'faculties', universityId ?? 'all'] as const,
  majors: (universityId?: string) => ['catalog', 'majors', universityId ?? 'all'] as const,
  curriculum: (majorId: string) => ['catalog', 'curriculum', majorId] as const,
  subjects: (query: unknown) => ['catalog', 'subjects', query] as const,
  subject: (id: string) => ['catalog', 'subject', id] as const,
  documents: (query: unknown) => ['documents', 'list', query] as const,
  document: (id: string) => ['documents', 'detail', id] as const,
  saved: ['documents', 'saved'] as const,
  grades: ['grades', 'list'] as const,
  gradeSummary: ['grades', 'summary'] as const,
  planner: (majorId: string, strong: boolean) => ['grades', 'planner', majorId, strong] as const,
};
