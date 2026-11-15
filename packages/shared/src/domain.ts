/**
 * Domain constants shared by the API and the web app.
 * Keeping them here means a label or an enum value is defined exactly once.
 */

export const DOCUMENT_TYPES = [
  'NOTES',
  'SLIDES',
  'EXERCISES',
  'EXAM',
  'REVIEW',
  'ASSIGNMENT',
  'BOOK',
  'REPORT',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, { en: string; vi: string; icon: string }> = {
  NOTES: { en: 'Lecture notes', vi: 'Ghi chép bài giảng', icon: 'notebook-pen' },
  SLIDES: { en: 'Course slides', vi: 'Slide bài giảng', icon: 'presentation' },
  EXERCISES: { en: 'Practice exercises', vi: 'Bài tập thực hành', icon: 'list-checks' },
  EXAM: { en: 'Exam papers', vi: 'Đề thi', icon: 'file-check' },
  REVIEW: { en: 'Review materials', vi: 'Tài liệu ôn tập', icon: 'book-marked' },
  ASSIGNMENT: { en: 'Assignments', vi: 'Bài tập lớn', icon: 'square-pen' },
  BOOK: { en: 'Reference books', vi: 'Sách tham khảo', icon: 'book-open' },
  REPORT: { en: 'Project reports', vi: 'Báo cáo đồ án', icon: 'scroll-text' },
};

export const FILE_FORMATS = ['PDF', 'DOCX', 'PPTX', 'XLSX'] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

export const FILE_FORMAT_COLORS: Record<FileFormat, string> = {
  PDF: '#CF3F35',
  DOCX: '#2D63CF',
  PPTX: '#CF5F22',
  XLSX: '#1C7F4F',
};

export const MIME_TO_FORMAT: Record<string, FileFormat> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOCX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-powerpoint': 'PPTX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.ms-excel': 'XLSX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
};

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export const SEMESTERS = ['S1', 'S2', 'SUMMER'] as const;
export type Semester = (typeof SEMESTERS)[number];

export const SEMESTER_LABELS: Record<Semester, { en: string; vi: string }> = {
  S1: { en: 'Semester 1', vi: 'Học kỳ 1' },
  S2: { en: 'Semester 2', vi: 'Học kỳ 2' },
  SUMMER: { en: 'Summer term', vi: 'Học kỳ hè' },
};

export const STUDY_YEARS = [1, 2, 3, 4] as const;

export const PREREQ_TYPES = ['PREREQUISITE', 'COREQUISITE', 'PRIOR'] as const;
export type PrereqType = (typeof PREREQ_TYPES)[number];

export const PREREQ_TYPE_LABELS: Record<PrereqType, { en: string; vi: string; hint: string }> = {
  PREREQUISITE: {
    en: 'Prerequisite',
    vi: 'Môn tiên quyết',
    hint: 'Must be passed before you can register.',
  },
  COREQUISITE: {
    en: 'Corequisite',
    vi: 'Môn song hành',
    hint: 'Must be taken in the same term or earlier.',
  },
  PRIOR: {
    en: 'Prior study',
    vi: 'Môn học trước',
    hint: 'Must have been studied before, a pass is not required.',
  },
};

export const DOCUMENT_STATUSES = ['PENDING', 'PUBLISHED', 'REJECTED', 'REMOVED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const ROLES = ['STUDENT', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const DOCUMENT_SORTS = ['relevance', 'downloads', 'views', 'recent', 'rating'] as const;
export type DocumentSort = (typeof DOCUMENT_SORTS)[number];

export const DOCUMENT_SORT_LABELS: Record<DocumentSort, string> = {
  relevance: 'Phù hợp nhất',
  downloads: 'Tải nhiều nhất',
  views: 'Xem nhiều nhất',
  recent: 'Mới nhất',
  rating: 'Đánh giá cao nhất',
};
