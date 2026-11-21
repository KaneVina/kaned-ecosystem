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
  'PROJECT',
  'TEXTBOOK',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, { en: string; vi: string; icon: string }> = {
  NOTES: { en: 'Lecture notes', vi: 'Ghi chép bài giảng', icon: 'notebook-pen' },
  SLIDES: { en: 'Course slides', vi: 'Slide bài giảng', icon: 'presentation' },
  EXERCISES: { en: 'Practice exercises', vi: 'Bài tập thực hành', icon: 'list-checks' },
  EXAM: { en: 'Exam papers', vi: 'Đề thi', icon: 'file-check' },
  REVIEW: { en: 'Review materials', vi: 'Tài liệu ôn tập', icon: 'book-marked' },
  ASSIGNMENT: { en: 'Assignments', vi: 'Bài tập lớn', icon: 'square-pen' },
  BOOK: { en: 'References', vi: 'Tham khảo', icon: 'book-open' },
  REPORT: { en: 'Project reports', vi: 'Báo cáo đồ án', icon: 'scroll-text' },
  PROJECT: { en: 'Group projects', vi: 'Dự án nhóm', icon: 'users' },
  TEXTBOOK: { en: 'Textbooks', vi: 'Giáo trình', icon: 'library' },
};

/**
 * LINK is a document that lives elsewhere (Google Slides, Canva, YouTube…);
 * GITHUB is one kept in a GitHub repository, folder or file.
 */
export const FILE_FORMATS = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'HTML', 'MD', 'DRAWIO', 'LINK', 'GITHUB'] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

/** Formats stored as an address instead of an uploaded file. */
export const EXTERNAL_FORMATS = ['LINK', 'GITHUB'] as const;
export const isExternalFormat = (format: string): format is (typeof EXTERNAL_FORMATS)[number] =>
  format === 'LINK' || format === 'GITHUB';

/** Formats that are uploaded as files. */
export const UPLOAD_FORMATS = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'HTML', 'MD', 'DRAWIO'] as const;

export const FILE_FORMAT_LABELS: Record<FileFormat, string> = {
  PDF: 'PDF',
  DOCX: 'Word',
  PPTX: 'PowerPoint',
  XLSX: 'Excel',
  HTML: 'HTML',
  MD: 'Markdown',
  DRAWIO: 'draw.io',
  LINK: 'Liên kết',
  GITHUB: 'GitHub',
};

export const FILE_FORMAT_COLORS: Record<FileFormat, string> = {
  PDF: '#CF3F35',
  DOCX: '#2D63CF',
  PPTX: '#CF5F22',
  XLSX: '#1C7F4F',
  LINK: '#4433B4',
  GITHUB: '#24292F',
  HTML: '#C2410C',
  MD: '#475467',
  DRAWIO: '#F08705',
};

export const MIME_TO_FORMAT: Record<string, FileFormat> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOCX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-powerpoint': 'PPTX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.ms-excel': 'XLSX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/html': 'HTML',
  'text/markdown': 'MD',
  'text/x-markdown': 'MD',
  'application/vnd.jgraph.mxfile': 'DRAWIO',
  'application/x-drawio': 'DRAWIO',
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

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, { vi: string; hint: string }> = {
  PENDING: { vi: 'Chờ duyệt', hint: 'Chưa hiện trong thư viện.' },
  PUBLISHED: { vi: 'Đã đăng', hint: 'Mọi người tìm thấy trong thư viện.' },
  REJECTED: { vi: 'Bị từ chối', hint: 'Không đạt yêu cầu, người đăng vẫn thấy.' },
  REMOVED: { vi: 'Đã gỡ', hint: 'Ẩn khỏi thư viện, có thể khôi phục.' },
};

export const ROLES = ['STUDENT', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, { vi: string; hint: string }> = {
  STUDENT: { vi: 'Sinh viên', hint: 'Dùng thư viện và công cụ học tập.' },
  MODERATOR: { vi: 'Kiểm duyệt viên', hint: 'Duyệt, sửa và gỡ tài liệu.' },
  ADMIN: { vi: 'Quản trị viên', hint: 'Toàn quyền: trường, môn, chương trình, người dùng.' },
};

/** Roles that may open the admin area. */
export const STAFF_ROLES: readonly Role[] = ['MODERATOR', 'ADMIN'];

export const REGIONS = ['north', 'central', 'south'] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABELS: Record<Region, string> = {
  north: 'Miền Bắc',
  central: 'Miền Trung',
  south: 'Miền Nam',
};

export const UNIVERSITY_KINDS = ['Public', 'Private', 'International'] as const;
export type UniversityKind = (typeof UNIVERSITY_KINDS)[number];
export const UNIVERSITY_KIND_LABELS: Record<UniversityKind, string> = {
  Public: 'Công lập',
  Private: 'Tư thục',
  International: 'Quốc tế',
};

export const DOCUMENT_SORTS = ['relevance', 'downloads', 'views', 'recent', 'rating'] as const;
export type DocumentSort = (typeof DOCUMENT_SORTS)[number];

export const DOCUMENT_SORT_LABELS: Record<DocumentSort, string> = {
  relevance: 'Phù hợp nhất',
  downloads: 'Tải nhiều nhất',
  views: 'Xem nhiều nhất',
  recent: 'Mới nhất',
  rating: 'Đánh giá cao nhất',
};
