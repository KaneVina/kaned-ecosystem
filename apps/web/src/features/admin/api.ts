import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminUserLibraryDto,
  AdminDeckDetailDto,
  DeckLearnerDto,
  AdminDeckDto,
  DeckInput,
  DeckListQuery,
  DeckUpdate,
  LecturerDetailDto,
  LecturerDto,
  LecturerImport,
  LecturerImportResult,
  LecturerInput,
  LecturerQuery,
  LecturerUpdate,
  AcademicTermDto,
  AcademicTermInput,
  ActivityDto,
  AdminDocumentDto,
  AdminDocumentQuery,
  AdminDocumentUpdate,
  AdminFacultyDto,
  AdminMajorDto,
  AdminOverviewDto,
  AdminSubjectDto,
  AdminUniversityDto,
  AdminUserDto,
  AdminUserQuery,
  CreateDocumentInput,
  CurriculumAddInput,
  CurriculumDto,
  CurriculumEntryInput,
  DocumentBulkInput,
  DocumentStatus,
  FacultyInput,
  FolderDto,
  FolderInput,
  FolderUpdate,
  MoveDocumentsInput,
  MajorInput,
  Paginated,
  Role,
  SubjectInput,
  SubjectSummaryDto,
  UniversityInput,
  ActivitySessionDto,
  AdminUserDetailDto,
  OnlineUserDto,
  PageViewDto,
  TopDocumentDto,
  TrackedKind,
  UserEventDto,
  UserEventType,
  AdminGradesOverviewDto,
  AdminGradesQuery,
  AdminUserGradesDto,
} from '@kaned/shared';
import { http, withKey } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/useIdempotencyKey';

/* ─────────────────────────────── reads ─────────────────────────────── */

const get = async <T,>(url: string, params?: object) => (await http.get<T>(`/admin${url}`, { params })).data;

export const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  activity: (p: object) => ['admin', 'activity', p] as const,
  universities: ['admin', 'universities'] as const,
  university: (id: string) => ['admin', 'universities', id] as const,
  faculties: (universityId: string) => ['admin', 'faculties', universityId] as const,
  majors: (universityId?: string) => ['admin', 'majors', universityId ?? 'all'] as const,
  terms: (universityId: string) => ['admin', 'terms', universityId] as const,
  subjects: (p: object) => ['admin', 'subjects', p] as const,
  subject: (id: string) => ['admin', 'subject', id] as const,
  folders: (subjectId: string) => ['admin', 'folders', subjectId] as const,
  curriculum: (majorId: string) => ['admin', 'curriculum', majorId] as const,
  candidates: (majorId: string, q: string) => ['admin', 'candidates', majorId, q] as const,
  documents: (p: object) => ['admin', 'documents', p] as const,
  users: (p: object) => ['admin', 'users', p] as const,
  online: ['admin', 'online'] as const,
  userActivity: (id: string) => ['admin', 'user-activity', id] as const,
  userSessions: (id: string, page: number) => ['admin', 'user-sessions', id, page] as const,
  sessionViews: (id: string) => ['admin', 'session-views', id] as const,
  userViews: (id: string, p: object) => ['admin', 'user-views', id, p] as const,
  userTopDocuments: (id: string) => ['admin', 'user-top-docs', id] as const,
  userLibrary: (id: string) => ['admin', 'user-library', id] as const,
  userEvents: (id: string, p: object) => ['admin', 'user-events', id, p] as const,
  grades: (p: object) => ['admin', 'grades', p] as const,
  userGrades: (id: string) => ['admin', 'user-grades', id] as const,
};

/* student grades: admins only */
export const useGradesOverview = (q: Partial<AdminGradesQuery>) =>
  useQuery({ queryKey: adminKeys.grades(q), queryFn: () => get<AdminGradesOverviewDto>('/grades', q), placeholderData: keepPreviousData });
export const useUserGrades = (id?: string) =>
  useQuery({ queryKey: adminKeys.userGrades(id ?? ''), queryFn: () => get<AdminUserGradesDto>(`/users/${id}/grades`), enabled: Boolean(id) });

/* activity: refreshed every 30 s, the same rhythm as the tabs' check-ins */
const LIVE = 30_000;
export const useOnlineUsers = (enabled = true) =>
  useQuery({ queryKey: adminKeys.online, queryFn: () => get<OnlineUserDto[]>('/online'), enabled, refetchInterval: LIVE });
export const useUserActivity = (id?: string) =>
  useQuery({ queryKey: adminKeys.userActivity(id ?? ''), queryFn: () => get<AdminUserDetailDto>(`/users/${id}/activity`), enabled: Boolean(id), refetchInterval: LIVE });
export const useUserSessions = (id: string, page: number) =>
  useQuery({
    queryKey: adminKeys.userSessions(id, page),
    queryFn: () => get<Paginated<ActivitySessionDto>>(`/users/${id}/sessions`, { page, pageSize: 15 }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE,
  });
export const useSessionViews = (id: string | null) =>
  useQuery({ queryKey: adminKeys.sessionViews(id ?? ''), queryFn: () => get<PageViewDto[]>(`/sessions/${id}/views`), enabled: Boolean(id) });
export const useUserViews = (id: string, p: { kind?: TrackedKind; page: number }) =>
  useQuery({
    queryKey: adminKeys.userViews(id, p),
    queryFn: () => get<Paginated<PageViewDto>>(`/users/${id}/views`, { ...p, pageSize: 25 }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE,
  });
export const useUserTopDocuments = (id: string) =>
  useQuery({ queryKey: adminKeys.userTopDocuments(id), queryFn: () => get<TopDocumentDto[]>(`/users/${id}/top-documents`) });
export const useUserLibrary = (id: string) =>
  useQuery({ queryKey: adminKeys.userLibrary(id), queryFn: () => get<AdminUserLibraryDto>(`/users/${id}/library`) });
export const useUserEvents = (id: string, p: { type?: UserEventType; page: number }) =>
  useQuery({
    queryKey: adminKeys.userEvents(id, p),
    queryFn: () => get<Paginated<UserEventDto>>(`/users/${id}/events`, { ...p, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

export const useOverview = () => useQuery({ queryKey: adminKeys.overview, queryFn: () => get<AdminOverviewDto>('/overview') });

export const useActivity = (p: { page: number; pageSize: number; entity?: string }) =>
  useQuery({ queryKey: adminKeys.activity(p), queryFn: () => get<Paginated<ActivityDto>>('/activity', p), placeholderData: keepPreviousData });

export const useUniversitiesAdmin = () =>
  useQuery({ queryKey: adminKeys.universities, queryFn: () => get<AdminUniversityDto[]>('/universities') });

export const useUniversityAdmin = (id?: string) =>
  useQuery({ queryKey: adminKeys.university(id ?? ''), queryFn: () => get<AdminUniversityDto>(`/universities/${id}`), enabled: Boolean(id) });

export const useFacultiesAdmin = (universityId?: string) =>
  useQuery({
    queryKey: adminKeys.faculties(universityId ?? ''),
    queryFn: () => get<AdminFacultyDto[]>(`/universities/${universityId}/faculties`),
    enabled: Boolean(universityId),
  });

export const useMajorsAdmin = (universityId?: string) =>
  useQuery({ queryKey: adminKeys.majors(universityId), queryFn: () => get<AdminMajorDto[]>('/majors', { universityId }) });

export const useTermsAdmin = (universityId?: string) =>
  useQuery({
    queryKey: adminKeys.terms(universityId ?? ''),
    queryFn: () => get<AcademicTermDto[]>(`/universities/${universityId}/terms`),
    enabled: Boolean(universityId),
  });

export interface SubjectListParams {
  q?: string;
  universityId?: string;
  facultyId?: string;
  page: number;
  pageSize: number;
}
export const useSubjectsAdmin = (p: SubjectListParams, enabled = true) =>
  useQuery({
    queryKey: adminKeys.subjects(p),
    queryFn: () => get<Paginated<AdminSubjectDto>>('/subjects', p),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useSubjectAdmin = (id?: string) =>
  useQuery({ queryKey: adminKeys.subject(id ?? ''), queryFn: () => get<AdminSubjectDto>(`/subjects/${id}`), enabled: Boolean(id) });

export const useFoldersAdmin = (subjectId?: string) =>
  useQuery({
    queryKey: adminKeys.folders(subjectId ?? ''),
    queryFn: () => get<FolderDto[]>(`/subjects/${subjectId}/folders`),
    enabled: Boolean(subjectId),
  });

export const useCurriculumAdmin = (majorId?: string) =>
  useQuery({
    queryKey: adminKeys.curriculum(majorId ?? ''),
    queryFn: () => get<CurriculumDto>(`/majors/${majorId}/curriculum`),
    enabled: Boolean(majorId),
  });

export const useCandidates = (majorId: string | undefined, q: string, enabled: boolean) =>
  useQuery({
    queryKey: adminKeys.candidates(majorId ?? '', q),
    queryFn: () => get<SubjectSummaryDto[]>(`/majors/${majorId}/candidates`, { q: q || undefined }),
    enabled: Boolean(majorId) && enabled,
    placeholderData: keepPreviousData,
  });

export type DocumentList = Paginated<AdminDocumentDto> & { statusCounts: Record<DocumentStatus, number> };
export const useDocumentsAdmin = (p: Partial<AdminDocumentQuery> & { page: number; pageSize: number }) =>
  useQuery({ queryKey: adminKeys.documents(p), queryFn: () => get<DocumentList>('/documents', p), placeholderData: keepPreviousData });

export const useUsersAdmin = (p: Partial<AdminUserQuery> & { page: number; pageSize: number }) =>
  useQuery({ queryKey: adminKeys.users(p), queryFn: () => get<Paginated<AdminUserDto>>('/users', p), placeholderData: keepPreviousData });

/* ─────────────────────────────── writes ────────────────────────────── */

/**
 * Every admin write goes through here. The Idempotency-Key is derived from
 * the payload, so a double click or a retry after a timeout sends the same
 * key and the server answers with the first result instead of acting twice.
 * Afterwards the admin views, the public catalogue and the library refetch.
 */
function useWrite<TVars, TResult>(request: (vars: TVars, key: string) => Promise<TResult>) {
  const client = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: (vars: TVars) => request(vars, idem.keyFor(vars)),
    onSuccess: () => {
      idem.done();
      void client.invalidateQueries({ queryKey: adminKeys.all });
      void client.invalidateQueries({ queryKey: ['catalog'] });
      void client.invalidateQueries({ queryKey: ['documents'] });
      void client.invalidateQueries({ queryKey: ['grades'] });
      void client.invalidateQueries({ queryKey: ['decks'] });
      void client.invalidateQueries({ queryKey: ['lecturers'] });
    },
  });
}

const send = async <T,>(method: 'post' | 'patch' | 'delete', url: string, key: string, body?: unknown) =>
  (await http.request<T>({ method, url: `/admin${url}`, data: body, ...withKey(key) })).data;

export const useSaveUniversity = () =>
  useWrite(({ id, input }: { id?: string; input: Partial<UniversityInput> }, key) =>
    id ? send<AdminUniversityDto>('patch', `/universities/${id}`, key, input) : send<AdminUniversityDto>('post', '/universities', key, input),
  );
export const useDeleteUniversity = () => useWrite((id: string, key) => send<void>('delete', `/universities/${id}`, key));

export const useSaveFaculty = () =>
  useWrite(({ id, input }: { id?: string; input: Partial<FacultyInput> }, key) =>
    id ? send<AdminFacultyDto>('patch', `/faculties/${id}`, key, input) : send<AdminFacultyDto>('post', '/faculties', key, input),
  );
export const useDeleteFaculty = () => useWrite((id: string, key) => send<void>('delete', `/faculties/${id}`, key));

export const useSaveMajor = () =>
  useWrite(({ id, input }: { id?: string; input: Partial<MajorInput> }, key) =>
    id ? send<AdminMajorDto>('patch', `/majors/${id}`, key, input) : send<AdminMajorDto>('post', '/majors', key, input),
  );
export const useDeleteMajor = () => useWrite((id: string, key) => send<void>('delete', `/majors/${id}`, key));

export const useSaveTerm = () =>
  useWrite(({ id, input }: { id?: string; input: Partial<AcademicTermInput> }, key) =>
    id ? send<AcademicTermDto>('patch', `/terms/${id}`, key, input) : send<AcademicTermDto>('post', '/terms', key, input),
  );
export const useDeleteTerm = () => useWrite((id: string, key) => send<void>('delete', `/terms/${id}`, key));

export const useSaveSubject = () =>
  useWrite(({ id, input }: { id?: string; input: Partial<SubjectInput> }, key) =>
    id ? send<AdminSubjectDto>('patch', `/subjects/${id}`, key, input) : send<AdminSubjectDto>('post', '/subjects', key, input),
  );
export const useDeleteSubject = () => useWrite((id: string, key) => send<void>('delete', `/subjects/${id}`, key));

export const useAddToCurriculum = () =>
  useWrite(({ majorId, input }: { majorId: string; input: CurriculumAddInput }, key) =>
    send<CurriculumDto>('post', `/majors/${majorId}/curriculum`, key, input),
  );
export const useUpdateCurriculum = () =>
  useWrite(({ majorId, subjectId, input }: { majorId: string; subjectId: string; input: Partial<CurriculumEntryInput> }, key) =>
    send<CurriculumDto>('patch', `/majors/${majorId}/curriculum/${subjectId}`, key, input),
  );
export const useRemoveFromCurriculum = () =>
  useWrite(({ majorId, subjectId }: { majorId: string; subjectId: string }, key) =>
    send<CurriculumDto>('delete', `/majors/${majorId}/curriculum/${subjectId}`, key),
  );

export const useCreateDocumentAdmin = () =>
  useWrite((input: CreateDocumentInput & { status?: DocumentStatus }, key) => send<AdminDocumentDto>('post', '/documents', key, input));
export const useUpdateDocumentAdmin = () =>
  useWrite(({ id, input }: { id: string; input: AdminDocumentUpdate }, key) => send<AdminDocumentDto>('patch', `/documents/${id}`, key, input));
export const useDeleteDocumentAdmin = () => useWrite((id: string, key) => send<void>('delete', `/documents/${id}`, key));
export const useBulkDocuments = () =>
  useWrite((input: DocumentBulkInput, key) => send<{ affected: number }>('post', '/documents/bulk', key, input));

export const useSignOutEverywhere = () =>
  useWrite((id: string, key) => send<{ revoked: number }>('post', `/users/${id}/sign-out`, key));
export const useSetRole = () =>
  useWrite(({ id, role }: { id: string; role: Role }, key) => send<{ id: string; role: Role }>('patch', `/users/${id}/role`, key, { role }));

export const useSaveFolder = () =>
  useWrite(({ id, input }: { id?: string; input: FolderInput | FolderUpdate }, key) =>
    id ? send<FolderDto>('patch', `/folders/${id}`, key, input) : send<FolderDto>('post', '/folders', key, input),
  );
export const useDeleteFolder = () => useWrite((id: string, key) => send<void>('delete', `/folders/${id}`, key));
export const useMoveDocuments = () =>
  useWrite((input: MoveDocumentsInput, key) => send<{ moved: number }>('post', '/documents/move', key, input));

/* ─────────────────────────────── decks ─────────────────────────────── */

export const useDecksAdmin = (p: DeckListQuery) =>
  useQuery({ queryKey: [...adminKeys.all, 'decks', p], queryFn: () => get<AdminDeckDto[]>('/decks', p), placeholderData: keepPreviousData });

export const useDeckAdmin = (id?: string) =>
  useQuery({ queryKey: [...adminKeys.all, 'deck', id], enabled: Boolean(id), queryFn: () => get<AdminDeckDetailDto>(`/decks/${id}`) });

export const useDeckLearners = (id: string | null) =>
  useQuery({ queryKey: [...adminKeys.all, 'deck-learners', id], enabled: Boolean(id), queryFn: () => get<DeckLearnerDto[]>(`/decks/${id}/learners`) });

export const useCreateDeck = () => useWrite((input: DeckInput, key) => send<AdminDeckDto>('post', '/decks', key, input));
export const useUpdateDeck = () => useWrite(({ id, input }: { id: string; input: DeckUpdate }, key) => send<AdminDeckDto>('patch', `/decks/${id}`, key, input));
export const useDeleteDeck = () => useWrite((id: string, key) => send<void>('delete', `/decks/${id}`, key));

/* lecturer directory */
export const useLecturersAdmin = (q: LecturerQuery) =>
  useQuery({ queryKey: [...adminKeys.all, 'lecturers', q], queryFn: () => get<Paginated<LecturerDto>>('/lecturers', q), placeholderData: keepPreviousData });
export const useSaveLecturer = () =>
  useWrite(({ id, input }: { id?: string; input: LecturerInput | LecturerUpdate }, key) =>
    id ? send<LecturerDetailDto>('patch', `/lecturers/${id}`, key, input) : send<LecturerDetailDto>('post', '/lecturers', key, input),
  );
export const useDeleteLecturer = () => useWrite((id: string, key) => send<void>('delete', `/lecturers/${id}`, key));
export const useImportLecturers = () => useWrite((input: LecturerImport, key) => send<LecturerImportResult>('post', '/lecturers/import', key, input));
