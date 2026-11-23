import { useQuery } from '@tanstack/react-query';
import type {
  AttemptResultDto,
  AttemptStateDto,
  HeartbeatResponse,
  HistoryItemDto,
  JoinLookup,
  JoinPrefillDto,
  MeStateDto,
  MonitorDto,
  PaperDto,
  SessionResultsDto,
  VecSessionDto,
  AnswerItem,
  CandidateInfo,
  SessionInput,
} from '@kaned/shared';
import { http } from '@/lib/api';

export interface HostDeck {
  id: string;
  title: string;
  questionCount: number;
  subjectCode: string;
  subjectName: string;
  color: string | null;
  chapters: Array<{ n: number; name: string; count: number }>;
  unassigned: number;
}

export const vecKeys = {
  me: ['vec', 'me'] as const,
  decks: ['vec', 'decks'] as const,
  hosted: ['vec', 'hosted'] as const,
  session: (id: string) => ['vec', 'session', id] as const,
  results: (id: string) => ['vec', 'results', id] as const,
  attempt: (id: string) => ['vec', 'attempt', id] as const,
  result: (id: string) => ['vec', 'result', id] as const,
  prefill: ['vec', 'prefill'] as const,
  taken: ['vec', 'taken'] as const,
  hostedHistory: ['vec', 'hosted-history'] as const,
};

const get = async <T,>(path: string, params?: unknown) => (await http.get<T>(`/vec${path}`, { params })).data;
const post = async <T,>(path: string, body?: unknown) => (await http.post<T>(`/vec${path}`, body ?? {})).data;

export const vec = {
  me: () => get<MeStateDto>('/me'),
  prefill: () => get<JoinPrefillDto>('/me/prefill'),
  decks: () => get<HostDeck[]>('/decks'),
  hosted: () => get<VecSessionDto[]>('/sessions'),
  session: (id: string) => get<VecSessionDto>(`/sessions/${id}`),
  create: (input: SessionInput) => post<VecSessionDto>('/sessions', input),
  patch: async (id: string, body: unknown) => (await http.patch<VecSessionDto>(`/vec/sessions/${id}`, body)).data,
  remove: async (id: string, confirm: string) => (await http.delete(`/vec/sessions/${id}`, { data: { confirm } })).data,
  action: (id: string, name: 'pause' | 'resume' | 'end' | 'cancel' | 'release-results') => post<unknown>(`/sessions/${id}/${name}`),
  postpone: (id: string, startsAt: string) => post<unknown>(`/sessions/${id}/postpone`, { startsAt }),
  announce: (id: string, body: string, urgent: boolean, attemptId?: string) => post<unknown>(`/sessions/${id}/announce`, { body, urgent, attemptId }),
  extend: (id: string, minutes: number, attemptIds?: string[]) => post<{ affected: number }>(`/sessions/${id}/extend`, { minutes, attemptIds }),
  monitor: (id: string, since: number) => get<MonitorDto>(`/sessions/${id}/monitor`, { since }),
  results: (id: string) => get<SessionResultsDto>(`/sessions/${id}/results`),
  grant: (id: string, userId: string, delta: number) => post<{ extraRetakes: number }>(`/sessions/${id}/candidates/${userId}/retakes`, { delta }),
  resumeLock: (attemptId: string, bonus: 'NONE' | 'LOCKED_TIME' | 'CUSTOM', bonusMin?: number) => post<unknown>(`/attempts/${attemptId}/resume-lock`, { bonus, bonusMin }),
  forceSubmit: (attemptId: string) => post<unknown>(`/attempts/${attemptId}/force-submit`),
  redo: (attemptId: string, countsTowardLimit: boolean, reason?: string) => post<{ attemptId: string }>(`/attempts/${attemptId}/redo`, { countsTowardLimit, reason }),
  removeCandidate: (attemptId: string, mode: 'GRADE_SAVED' | 'VOID', reason: string) => post<unknown>(`/attempts/${attemptId}/remove`, { mode, reason }),
  decide: (requestId: string, approve: boolean) => post<unknown>(`/requests/${requestId}/decide`, { approve }),

  lookup: (code: string) => post<JoinLookup>('/join/lookup', { code }),
  otp: (code: string, otp: string) => post<JoinLookup>('/join/otp', { code, otp }),
  enter: (ticket: string, info: CandidateInfo, consent: true) => post<{ attemptId: string }>('/join/enter', { ticket, info, consent }),

  attempt: (id: string) => get<AttemptStateDto>(`/attempts/${id}`),
  start: (id: string) => post<AttemptStateDto>(`/attempts/${id}/start`),
  claim: (id: string, connectionId?: string) => post<{ connectionId: string }>(`/attempts/${id}/claim`, { connectionId }),
  paper: (id: string) => get<PaperDto>(`/attempts/${id}/paper`),
  saveAnswers: (id: string, items: AnswerItem[]) => http.put<{ saved: number; serverNow: number }>(`/vec/attempts/${id}/answers`, { items }).then((r) => r.data),
  submit: (id: string, items?: AnswerItem[]) => post<{ state: string; serverNow: number }>(`/attempts/${id}/submit`, { items }),
  heartbeat: (id: string, body: unknown) => post<HeartbeatResponse>(`/attempts/${id}/heartbeat`, body),
  violation: (id: string, type: string, data?: Record<string, unknown>) => post<{ severity: string; state: string; lockReason: string | null }>(`/attempts/${id}/violations`, { type, data }),
  result: (id: string) => get<AttemptResultDto>(`/attempts/${id}/result`),
  retake: (id: string) => post<{ attemptId: string }>(`/attempts/${id}/retake`),
  request: (id: string, kind: 'UNLOCK' | 'RETAKE', reason: string) => post<unknown>(`/attempts/${id}/request`, { kind, reason }),
  takenHistory: () => get<HistoryItemDto[]>('/history/taken'),
  hostedHistory: () => get<HistoryItemDto[]>('/history/hosted'),
};

export const useVecMe = () => useQuery({ queryKey: vecKeys.me, queryFn: vec.me, staleTime: 10_000 });
export const useHostDecks = () => useQuery({ queryKey: vecKeys.decks, queryFn: vec.decks, staleTime: 5 * 60_000 });
export const useHosted = () => useQuery({ queryKey: vecKeys.hosted, queryFn: vec.hosted, refetchInterval: 15_000, staleTime: 5_000 });
export const useVecSession = (id: string) => useQuery({ queryKey: vecKeys.session(id), queryFn: () => vec.session(id), staleTime: 5_000 });
export const useAttemptResult = (id: string) => useQuery({ queryKey: vecKeys.result(id), queryFn: () => vec.result(id), staleTime: 0 });

export const csvUrl = (id: string) => `/api/vec/sessions/${id}/results.csv`;
