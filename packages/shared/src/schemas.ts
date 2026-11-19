import { passCriteriaValuesSchema } from './passCriteria.js';
import { z } from 'zod';
import {
  DOCUMENT_SORTS,
  DOCUMENT_TYPES,
  FILE_FORMATS,
  MAX_UPLOAD_BYTES,
  SEMESTERS,
} from './domain.js';

/* ------------------------------------------------------------------ auth */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .email('That does not look like an email address.')
  .max(190)
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'That password is too long.');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(80),
  email: emailSchema,
  password: passwordSchema,
  universityId: z.string().uuid().optional().nullable(),
  majorId: z.string().uuid().optional().nullable(),
  year: z.coerce.number().int().min(1).max(8).optional().nullable(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(280).optional().nullable(),
  universityId: z.string().uuid().optional().nullable(),
  majorId: z.string().uuid().optional().nullable(),
  year: z.coerce.number().int().min(1).max(8).optional().nullable(),
  avatarUrl: z.string().url('Dán một liên kết ảnh hợp lệ.').max(500).optional().nullable(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/* -------------------------------------------------------------- documents */

const idList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const arr = Array.isArray(v) ? v : v.split(',');
    const cleaned = arr.map((s) => s.trim()).filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  });

const numberList = z
  .union([z.string(), z.array(z.string()), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const arr = Array.isArray(v) ? v : String(v).split(',');
    const nums = arr.map((s) => Number(String(s).trim())).filter((n) => Number.isFinite(n));
    return nums.length ? nums : undefined;
  });

export const documentQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  universityId: idList,
  facultyId: z.string().optional(),
  majorId: z.string().optional(),
  subjectId: idList,
  type: idList,
  format: idList,
  year: numberList,
  semester: idList,
  /** The school's own terms (academic_terms ids), e.g. FPT "Fall 2026". */
  termId: idList,
  /** The school's own teaching periods, e.g. FPT "Block 10". */
  period: idList,
  minRating: z.coerce.number().min(0).max(5).optional(),
  uploaderId: z.string().optional(),
  bookmarkedBy: z.string().optional(),
  folderId: z.string().optional(),
  sort: z.enum(DOCUMENT_SORTS).default('downloads'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
export type DocumentQuery = z.infer<typeof documentQuerySchema>;

export const createDocumentSchema = z.object({
  title: z.string().trim().min(10, 'Make the title a little longer.').max(180),
  description: z.string().trim().min(30, 'Add a short description.').max(2000),
  type: z.enum(DOCUMENT_TYPES),
  format: z.enum(FILE_FORMATS),
  universityId: z.string().min(1, 'Choose a university.'),
  subjectId: z.string().min(1, 'Choose a subject.'),
  year: z.coerce.number().int().min(1).max(8),
  semester: z.enum(SEMESTERS),
  schoolYear: z.string().trim().max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  language: z.string().trim().max(30).default('Vietnamese'),
  /** Which of the university's own terms this is from; fills semester and school year. */
  academicTermId: z.string().uuid().nullish(),
  /** Folder inside the subject, e.g. "Đề thi". */
  folderId: z.string().uuid().nullish(),
  /** Lecturer who taught it, optional. */
  lecturer: z.string().trim().max(120).nullish(),
  /** The lecturer's profile in the directory, when picked from the suggestions. */
  lecturerId: z.string().uuid().nullish(),
  /** The school's own teaching period, e.g. FPT "Block 10 - Half 1". */
  period: z.string().trim().max(40).nullish(),
  /** How to download and use it, written by the uploader (GitHub documents). */
  guide: z.string().trim().max(1500).nullish(),
  // A file returned by Cloudinary after a direct browser upload, or, with
  // format LINK or GITHUB, the address of a document hosted elsewhere (no public id, 0 bytes).
  fileUrl: z.string().trim().url('Dán một liên kết hợp lệ, bắt đầu bằng https://').max(2000),
  filePublicId: z.string().max(300).default(''),
  fileBytes: z.coerce.number().int().min(0).max(MAX_UPLOAD_BYTES).default(0),
  pages: z.coerce.number().int().min(1).max(5000).optional(),
  thumbnailUrl: z.string().url().optional().nullable(),
  /** Lưu hành nội bộ, and what viewers may do with it. */
  internal: z.boolean().default(false),
  allowDownload: z.boolean().default(true),
  allowShare: z.boolean().default(true),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = createDocumentSchema.partial().omit({
  fileUrl: true,
  filePublicId: true,
  fileBytes: true,
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const reviewSchema = z.object({
  score: z.coerce.number().int().min(1, 'Choose a star rating.').max(5),
  comment: z.string().trim().min(10, 'Write a few words about the document.').max(1000),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const collectionSchema = z.object({
  name: z.string().trim().min(1, 'Give the collection a name.').max(60),
});
export type CollectionInput = z.infer<typeof collectionSchema>;

/* ----------------------------------------------------------------- grades */

export const gradeEntrySchema = z.object({
  subjectId: z.string().min(1),
  score10: z.coerce.number().min(0).max(10).nullable(),
  termNo: z.coerce.number().int().min(1).max(16).nullable().optional(),
  inProgress: z.boolean().optional().default(false),
  /** Component scores and ticked tasks, keyed by the subject's pass criterion id. */
  criteria: passCriteriaValuesSchema.optional(),
});
export type GradeEntryInputDto = z.infer<typeof gradeEntrySchema>;

export const saveGradesSchema = z.object({
  entries: z.array(gradeEntrySchema).max(300),
});
export type SaveGradesInput = z.infer<typeof saveGradesSchema>;

export const plannerQuerySchema = z.object({
  majorId: z.string().min(1, 'Choose a major.'),
  passMark: z.coerce.number().min(0).max(10).optional(),
});
export type PlannerQuery = z.infer<typeof plannerQuerySchema>;

/* ---------------------------------------------------------------- catalog */

export const subjectQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  universityId: z.string().optional(),
  facultyId: z.string().optional(),
  majorId: z.string().optional(),
  year: z.coerce.number().int().min(1).max(8).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(24),
});
export type SubjectQuery = z.infer<typeof subjectQuerySchema>;

/* ---------------------------------------------------------------- uploads */

export const uploadSignatureSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  bytes: z.coerce.number().int().min(1).max(MAX_UPLOAD_BYTES),
  mimeType: z.string().trim().max(120).optional(),
});
export type UploadSignatureInput = z.infer<typeof uploadSignatureSchema>;
