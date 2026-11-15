import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CurriculumSubjectDto,
  GpaSummary,
  GradeDto,
  MajorDto,
  PlannerGrade,
  PlannerResult,
  PlannerSummary,
  SaveGradesInput,
} from '@kaned/shared';
import { http } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

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
  subjects: CurriculumSubjectDto[];
  summary: PlannerSummary;
  suggestion: PlannerResult[];
}

export function usePlanner(majorId?: string) {
  return useQuery({
    queryKey: queryKeys.planner(majorId ?? ''),
    queryFn: async () => (await http.get<PlannerResponse>('/grades/planner', { params: { majorId } })).data,
    enabled: Boolean(majorId),
  });
}

/* ─────────────────────────── grade draft ─────────────────────────── */

export interface DraftEntry {
  /** What the student typed, kept as text so "8." or "" can be edited freely. */
  score: string;
  inProgress: boolean;
  termNo: number | null;
}

/** A valid score on the 10-point scale, or null. */
export function parseScore(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return Math.round(n * 100) / 100;
}

export const isInvalidScore = (raw: string) => raw.trim() !== '' && parseScore(raw) === null;

/**
 * The student's grades as an editable draft. Both the subject workspace and
 * the GPA calculator read and write through this, so the two always agree.
 * Saving sends the whole set the API keeps (it replaces), including grades for
 * subjects outside the curriculum on screen, which are left untouched.
 */
export function useGradeDraft() {
  const { data: saved, isLoading } = useGrades();
  const save = useSaveGrades();
  const [draft, setDraft] = useState<Record<string, DraftEntry>>({});
  const [ready, setReady] = useState(false);

  const fromSaved = useCallback((list: GradeDto[]) => {
    const next: Record<string, DraftEntry> = {};
    for (const g of list) {
      next[g.subjectId] = {
        score: g.score10 === null ? '' : String(g.score10),
        inProgress: g.inProgress,
        termNo: g.termNo,
      };
    }
    return next;
  }, []);

  useEffect(() => {
    if (saved && !ready) {
      setDraft(fromSaved(saved));
      setReady(true);
    }
  }, [saved, ready, fromSaved]);

  const savedMap = useMemo(() => (saved ? fromSaved(saved) : {}), [saved, fromSaved]);

  const setEntry = useCallback((subjectId: string, patch: Partial<DraftEntry>) => {
    setDraft((d) => {
      const current = d[subjectId] ?? { score: '', inProgress: false, termNo: null };
      return { ...d, [subjectId]: { ...current, ...patch } };
    });
  }, []);

  const changed = useMemo(() => {
    const ids = new Set([...Object.keys(draft), ...Object.keys(savedMap)]);
    let n = 0;
    for (const id of ids) {
      const a = draft[id];
      const b = savedMap[id];
      const sa = a ? parseScore(a.score) : null;
      const sb = b ? parseScore(b.score) : null;
      if (sa !== sb || Boolean(a?.inProgress) !== Boolean(b?.inProgress)) n += 1;
    }
    return n;
  }, [draft, savedMap]);

  /** Grades as the planner reads them. */
  const plannerGrades = useMemo<PlannerGrade[]>(
    () =>
      Object.entries(draft)
        .map(([subjectId, e]) => ({ subjectId, score10: parseScore(e.score), inProgress: e.inProgress }))
        .filter((g) => g.score10 !== null || g.inProgress),
    [draft],
  );

  const reset = useCallback(() => setDraft(savedMap), [savedMap]);

  /** Subjects whose box holds something that is not a 0–10 score. */
  const invalid = useMemo(
    () => Object.entries(draft).filter(([, e]) => !e.inProgress && isInvalidScore(e.score)).map(([id]) => id),
    [draft],
  );

  const commit = useCallback(
    async (termFor?: (subjectId: string) => number | null) => {
      // Saving replaces the whole set, so an unreadable box would silently erase that grade.
      if (invalid.length) throw new Error(`Có ${invalid.length} ô điểm không hợp lệ. Điểm phải từ 0 đến 10 — sửa các ô đỏ rồi lưu lại.`);
      const entries: SaveGradesInput['entries'] = Object.entries(draft)
        .map(([subjectId, e]) => ({
          subjectId,
          score10: e.inProgress ? null : parseScore(e.score),
          termNo: e.termNo ?? termFor?.(subjectId) ?? null,
          inProgress: e.inProgress,
        }))
        .filter((e) => e.score10 !== null || e.inProgress);
      const result = await save.mutateAsync({ entries });
      setDraft(fromSaved(result));
      return result;
    },
    [draft, invalid, save, fromSaved],
  );

  return {
    draft,
    ready: ready || (!isLoading && !saved),
    setEntry,
    reset,
    commit,
    saving: save.isPending,
    changed,
    invalid,
    plannerGrades,
  };
}
