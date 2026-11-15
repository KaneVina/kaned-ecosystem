import { BookMarked, BookOpen, FileCheck, ListChecks, NotebookPen, Presentation, ScrollText, SquarePen, type LucideIcon } from 'lucide-react';
import type { DocumentType } from '@kaned/shared';

/** One icon per document type, matching DOCUMENT_TYPE_LABELS[type].icon. */
export const TYPE_ICONS: Record<DocumentType, LucideIcon> = {
  NOTES: NotebookPen,
  SLIDES: Presentation,
  EXERCISES: ListChecks,
  EXAM: FileCheck,
  REVIEW: BookMarked,
  ASSIGNMENT: SquarePen,
  BOOK: BookOpen,
  REPORT: ScrollText,
};
