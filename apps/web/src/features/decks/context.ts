import { createContext, useContext } from 'react';
import type { DeckDetailDto, DeckProgress } from '@kaned/shared';
import type { DeckModel, ExamSession, FlipSession, Order, PracticeSession, Scope, Slice, StudySettings, useDeckProgress } from './model';

export const MODES = ['overview', 'practice', 'flip', 'exam', 'tips', 'browse'] as const;
export type Mode = (typeof MODES)[number];

export interface BrowseState {
  q: string;
  ch: number;
  scope: Scope | 'ok' | 'multi';
  hide: boolean;
  limit: number;
}

export interface StartOptions {
  ch?: number;
  scope?: Scope;
  slice?: Slice;
  order?: Order;
  custom?: { ids: string[]; label: string } | null;
  startId?: string;
}

export interface DeckCtx {
  deck: DeckDetailDto;
  m: DeckModel;
  state: DeckProgress;
  progress: ReturnType<typeof useDeckProgress>;
  settings: StudySettings;
  setSetting: <K extends keyof StudySettings>(k: K, v: StudySettings[K]) => void;
  practice: PracticeSession;
  setPractice: (s: PracticeSession | ((s: PracticeSession) => PracticeSession)) => void;
  flip: FlipSession;
  setFlip: (s: FlipSession | ((s: FlipSession) => FlipSession)) => void;
  exam: ExamSession;
  setExam: (s: ExamSession | ((s: ExamSession) => ExamSession)) => void;
  browse: BrowseState;
  setBrowse: (s: BrowseState | ((s: BrowseState) => BrowseState)) => void;
  startPractice: (o?: StartOptions) => void;
  startFlip: (o?: StartOptions) => void;
  go: (mode: Mode) => void;
}

export const DeckContext = createContext<DeckCtx | null>(null);

export function useDeckCtx() {
  const ctx = useContext(DeckContext);
  if (!ctx) throw new Error('useDeckCtx outside DeckPage');
  return ctx;
}
