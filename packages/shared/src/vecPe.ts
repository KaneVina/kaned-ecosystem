import { z } from 'zod';

/**
 * PE (practical exam) rooms: the candidate reads a paper, downloads the given
 * materials, works on their own machine and submits a solution folder or file.
 * The lecturer downloads the submissions and enters a score and a note.
 *
 * Everything of a PE room (paper uploads, materials, submissions) lives for a
 * week after the room closes; deleting the room removes it at once.
 */

export const PE_RETENTION_DAYS = 7;
export const PE_RETENTION_MS = PE_RETENTION_DAYS * 24 * 3600_000;
export const PE_MAX_PAPER_ITEMS = 6;
export const PE_MAX_MATERIAL_ITEMS = 12;
export const PE_MAX_UPLOAD_MB = 100;
export const PE_NOTE_MAX = 1000;
/** Uploads that began before time ran out still count for this long after it. */
export const PE_LATE_UPLOAD_GRACE_MS = 3 * 60_000;

export const PE_FILE_ROLES = ['PAPER', 'MATERIAL', 'SUBMISSION'] as const;
export type PeFileRole = (typeof PE_FILE_ROLES)[number];

/** Files never accepted in a submission, even inside a folder. */
export const PE_BLOCKED_EXT = ['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'vbe', 'jse', 'wsf', 'cpl', 'pif', 'reg', 'lnk', 'app', 'dmg', 'apk'] as const;
/** Folders a solution never needs: build output, dependencies, editor state. */
export const PE_SKIP_DIRS = ['bin', 'obj', 'node_modules', '.git', '.vs', '.idea', '.gradle', 'build', 'dist', 'target', '__pycache__', '.venv', 'venv', 'packages', '.next', 'out'] as const;

/** Extension groups the lecturer can tick for single-file submissions. */
export const PE_EXT_GROUPS: Array<{ key: string; label: string; exts: string[] }> = [
  { key: 'archive', label: 'Tệp nén', exts: ['zip', 'rar', '7z'] },
  { key: 'doc', label: 'Tài liệu', exts: ['pdf', 'docx', 'doc', 'xlsx', 'pptx', 'txt', 'md'] },
  { key: 'code', label: 'Mã nguồn', exts: ['java', 'cs', 'py', 'js', 'ts', 'tsx', 'jsx', 'c', 'cpp', 'h', 'sql', 'html', 'css', 'json', 'xml', 'kt', 'dart', 'php', 'go'] },
  { key: 'image', label: 'Hình ảnh', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
];

export const peSubmissionSchema = z.object({
  /** Solution folder (zipped in the browser) and/or files. */
  allowFolder: z.boolean().default(true),
  allowFiles: z.boolean().default(true),
  /** Lower-case extensions allowed for files; empty = anything not blocked. */
  allowedExts: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9]{1,10}$/)).max(60).default([]),
  maxSizeMb: z.number().int().min(1).max(PE_MAX_UPLOAD_MB).default(50),
  skipBuildDirs: z.boolean().default(true),
  /** How many submissions are kept; older ones are deleted. */
  keepVersions: z.number().int().min(1).max(10).default(5),
  /** The candidate must have submitted before they may close the room. */
  required: z.boolean().default(true),
});
export type PeSubmissionConfig = z.infer<typeof peSubmissionSchema>;

export const peItemSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('LIBRARY'), documentId: z.string().min(1).max(64) }),
  z.object({ source: z.literal('UPLOAD'), fileId: z.string().min(1).max(64) }),
]);
export type PeItemInput = z.infer<typeof peItemSchema>;

export const peConfigSchema = z.object({
  examCode: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_\-.]+$/, 'Mã đề chỉ gồm chữ, số, dấu _ - .'),
  paper: z.array(peItemSchema).min(1, 'Thêm ít nhất một tệp đề thi.').max(PE_MAX_PAPER_ITEMS),
  materials: z.array(peItemSchema).max(PE_MAX_MATERIAL_ITEMS).default([]),
  protect: z
    .object({
      noCopy: z.boolean().default(true),
      watermark: z.boolean().default(true),
    })
    .default({}),
  submission: peSubmissionSchema.default({}),
});
export type PeConfigInput = z.infer<typeof peConfigSchema>;

/** What a PE room keeps about its paper and materials once created. */
export interface PeStoredItem {
  source: 'LIBRARY' | 'UPLOAD';
  /** documents.id or vec_files.id */
  ref: string;
  name: string;
  format: string;
  bytes: number;
}
export interface PeStoredConfig {
  examCode: string;
  paper: PeStoredItem[];
  materials: PeStoredItem[];
  protect: { noCopy: boolean; watermark: boolean };
  submission: PeSubmissionConfig;
}

export const peSignSchema = z.object({
  role: z.enum(PE_FILE_ROLES),
  attemptId: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(200),
  bytes: z.number().int().min(1).max(PE_MAX_UPLOAD_MB * 1024 * 1024),
});
export const peSubmitSchema = z.object({
  fileId: z.string().min(1).max(64),
  /** What the candidate picked: the folder name, or the file names. */
  path: z.string().trim().min(1).max(400),
  fileCount: z.number().int().min(1).max(20_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  note: z.string().trim().max(PE_NOTE_MAX).optional(),
  skipped: z.number().int().min(0).max(100_000).default(0),
});
export const peGradeSchema = z.object({
  score10: z.number().min(0).max(10).multipleOf(0.25).nullable(),
  note: z.string().trim().max(PE_NOTE_MAX).nullable(),
});
export const peCloseSchema = z.object({ signed: z.literal(true) });

export interface PeUploadTicket {
  fileId: string;
  mode: 'cloudinary' | 'local';
  url: string;
  /** Form fields to send with the file (Cloudinary). */
  fields: Record<string, string>;
}

export interface PeSubmissionDto {
  id: string;
  no: number;
  path: string;
  fileName: string;
  fileCount: number;
  bytes: number;
  sha256: string;
  note: string | null;
  late: boolean;
  createdAt: number;
}

export interface PeItemDto {
  id: string;
  source: 'LIBRARY' | 'UPLOAD';
  name: string;
  format: string;
  bytes: number;
}

/** The candidate's view of a PE room. */
export interface PeRoomDto {
  examCode: string;
  paper: PeItemDto[];
  materials: PeItemDto[];
  protect: { noCopy: boolean; watermark: boolean };
  submission: PeSubmissionConfig;
  submissions: PeSubmissionDto[];
  closedAt: number | null;
  grade: null | { score10: number | null; note: string | null; gradedAt: number | null };
}

/** One paper document, ready for the paper window. */
export interface PePaperDocDto {
  id: string;
  name: string;
  format: string;
  /** Kaned page that shows the file (iframe). */
  src: string | null;
  /** Word files: drawn in the page from this address. */
  docx?: string;
  /** Pictures: shown directly. */
  image?: string;
  /** Markdown / text: shown as text. */
  text?: string;
}

export interface PeGradeRow {
  attemptId: string;
  userId: string;
  fullName: string;
  studentCode: string;
  email: string;
  className: string;
  state: string;
  startedAt: number | null;
  closedAt: number | null;
  submissions: PeSubmissionDto[];
  score10: number | null;
  note: string | null;
  gradedAt: number | null;
  gradedBy: string | null;
}

export interface PeGradingDto {
  examCode: string;
  retentionUntil: number | null;
  rows: PeGradeRow[];
  totals: { candidates: number; submitted: number; graded: number; bytes: number };
}

/* ───────────────────────────── helpers ───────────────────────────── */

export const extOf = (name: string) => {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : '';
};

/** The viewer format for a file name (same names as documents.format, plus IMAGE and TEXT). */
export function peFormatOf(name: string): string {
  const e = extOf(name);
  if (e === 'pdf') return 'PDF';
  if (e === 'docx' || e === 'doc') return 'DOCX';
  if (e === 'pptx' || e === 'ppt') return 'PPTX';
  if (e === 'xlsx' || e === 'xls') return 'XLSX';
  if (e === 'md' || e === 'markdown') return 'MD';
  if (e === 'html' || e === 'htm') return 'HTML';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return 'IMAGE';
  if (['txt', 'sql', 'json', 'xml', 'csv', 'java', 'cs', 'py', 'js', 'ts', 'c', 'cpp', 'h'].includes(e)) return 'TEXT';
  if (['zip', 'rar', '7z'].includes(e)) return 'ZIP';
  return 'FILE';
}

/** Formats the paper window can show. */
export const PE_PAPER_FORMATS = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'MD', 'HTML', 'IMAGE', 'TEXT', 'DRAWIO'] as const;

export const isBlockedExt = (name: string) => (PE_BLOCKED_EXT as readonly string[]).includes(extOf(name));

/** Subject code → a short exam code such as "PRM393_PE_7KQ2". Letters that read alike are left out. */
export function newExamCode(subjectCode: string, rand: () => number = Math.random): string {
  const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const base = (subjectCode || 'EXAM')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12) || 'EXAM';
  let tail = '';
  for (let i = 0; i < 4; i++) tail += ABC[Math.floor(rand() * ABC.length)];
  return `${base}_PE_${tail}`;
}

export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;

/** Whether a single file may be submitted under this config. */
export function fileAllowed(name: string, cfg: Pick<PeSubmissionConfig, 'allowedExts'>): boolean {
  if (isBlockedExt(name)) return false;
  if (!cfg.allowedExts.length) return true;
  return cfg.allowedExts.includes(extOf(name));
}
