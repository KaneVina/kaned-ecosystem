import { useQuery } from '@tanstack/react-query';
import type {
  AcademicTermDto,
  CurriculumDto,
  FacultyDto,
  MajorDto,
  Paginated,
  SubjectDetailDto,
  SubjectSummaryDto,
  UniversityDto,
} from '@kaned/shared';
import { http } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

export function useUniversities() {
  return useQuery({
    queryKey: queryKeys.universities,
    queryFn: async () => (await http.get<UniversityDto[]>('/catalog/universities')).data,
    staleTime: 10 * 60_000,
  });
}

export function useFaculties(universityId?: string) {
  return useQuery({
    queryKey: queryKeys.faculties(universityId),
    queryFn: async () =>
      (await http.get<FacultyDto[]>('/catalog/faculties', { params: { universityId } })).data,
    staleTime: 10 * 60_000,
  });
}

export function useMajors(universityId?: string) {
  return useQuery({
    queryKey: queryKeys.majors(universityId),
    queryFn: async () => (await http.get<MajorDto[]>('/catalog/majors', { params: { universityId } })).data,
    staleTime: 10 * 60_000,
  });
}

export function useCurriculum(majorId?: string) {
  return useQuery({
    queryKey: queryKeys.curriculum(majorId ?? ''),
    queryFn: async () => (await http.get<CurriculumDto>(`/catalog/majors/${majorId}/curriculum`)).data,
    enabled: Boolean(majorId),
    staleTime: 10 * 60_000,
  });
}

export function useSubjects(params: {
  q?: string;
  universityId?: string;
  majorId?: string;
  year?: number;
  page?: number;
  pageSize?: number;
}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.subjects(params),
    queryFn: async () => (await http.get<Paginated<SubjectSummaryDto>>('/catalog/subjects', { params })).data,
    placeholderData: (previous) => previous,
    enabled: options.enabled ?? true,
  });
}

export function useSubject(idOrCode?: string) {
  return useQuery({
    queryKey: queryKeys.subject(idOrCode ?? ''),
    queryFn: async () => (await http.get<SubjectDetailDto>(`/catalog/subjects/${idOrCode}`)).data,
    enabled: Boolean(idOrCode),
  });
}

/** A university's own terms ("Fall 2025", "HK1 2025–2026"), newest first. */
export function useTerms(universityId?: string) {
  return useQuery({
    queryKey: ['catalog', 'terms', universityId ?? ''],
    queryFn: async () => (await http.get<AcademicTermDto[]>(`/catalog/universities/${universityId}/terms`)).data,
    enabled: Boolean(universityId),
    staleTime: 10 * 60_000,
  });
}
