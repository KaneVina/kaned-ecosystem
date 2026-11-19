import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { LecturerDetailDto, LecturerDto, LecturerQuery, Paginated } from '@kaned/shared';
import { http } from '@/lib/api';

export const lecturerKeys = {
  all: ['lecturers'] as const,
  list: (q: LecturerQuery) => ['lecturers', 'list', q] as const,
  one: (id: string) => ['lecturers', 'one', id] as const,
  departments: (uni: string) => ['lecturers', 'departments', uni] as const,
};

export function useLecturers(q: LecturerQuery, enabled = true) {
  return useQuery({
    queryKey: lecturerKeys.list(q),
    queryFn: async () => (await http.get<Paginated<LecturerDto>>('/lecturers', { params: q })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  });
}

export function useLecturer(id: string | null | undefined) {
  return useQuery({
    queryKey: lecturerKeys.one(id ?? ''),
    queryFn: async () => (await http.get<LecturerDetailDto>(`/lecturers/${id}`)).data,
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useLecturerDepartments(universityId: string) {
  return useQuery({
    queryKey: lecturerKeys.departments(universityId),
    queryFn: async () => (await http.get<string[]>('/lecturers/departments', { params: universityId ? { universityId } : {} })).data,
    staleTime: 5 * 60_000,
  });
}
