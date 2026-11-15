import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GpaSummary, GradeDto, MajorDto, PlannerResult, PlannerSummary, SaveGradesInput } from '@kaned/shared';
import { http } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import type { CurriculumSubject } from '@/features/catalog/queries';

export function useGrades() {
  return useQuery({
    queryKey: queryKeys.grades,
    queryFn: async () => (await http.get<GradeDto[]>('/grades')).data,
  });
}

export function useGradeSummary() {
  return useQuery({
    queryKey: queryKeys.gradeSummary,
    queryFn: async () => (await http.get<GpaSummary>('/grades/summary')).data,
  });
}

export function useSaveGrades() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveGradesInput) => (await http.put<GradeDto[]>('/grades', input)).data,
    onSuccess: (data) => {
      client.setQueryData(queryKeys.grades, data);
      void client.invalidateQueries({ queryKey: queryKeys.gradeSummary });
      void client.invalidateQueries({ queryKey: ['grades', 'planner'] });
    },
  });
}

export interface PlannerResponse {
  major: MajorDto;
  subjects: CurriculumSubject[];
  summary: PlannerSummary;
  suggestion: PlannerResult[];
}

export function usePlanner(majorId?: string, requireStrongPass = false) {
  return useQuery({
    queryKey: queryKeys.planner(majorId ?? '', requireStrongPass),
    queryFn: async () =>
      (
        await http.get<PlannerResponse>('/grades/planner', {
          params: { majorId, requireStrongPass },
        })
      ).data,
    enabled: Boolean(majorId),
  });
}
