import { passCriteriaSchema } from './passCriteria.js';
import { assessmentSchemeSchema } from './assessment.js';
/**
 * Admin area: input schemas and response shapes. The API validates with the
 * schemas and the dashboard's forms use the very same ones, so a rule like
 * "a term code is 2–16 characters" is written once.
 */
import { z } from 'zod';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  FILE_FORMATS,
  REGIONS,
  ROLES,
  SEMESTERS,
  UNIVERSITY_KINDS,
  type DocumentStatus,
  type Role,
  type Semester,
} from './domain.js';
import type { Requirement } from './planner.js';
import type { SignInMethod } from './oauth.js';
import { ACTIVITY_FILTERS } from './tracking.js';
import type { DocumentSummaryDto, MajorDto, SubjectSummaryDto, UniversityDto } from './types.js';
import { updateDocumentSchema } from './schemas.js';

/* ───────────────────────────── field helpers ───────────────────────────── */

const name = (label: string, max = 160) =>
  z.string().trim().min(2, `${label} cần ít nhất 2 ký tự.`).max(max, `${label} dài quá ${max} ký tự.`);

/** Codes keep their case: FPT writes "SWE201c", and the c means something. */
const code = (max: number) =>
  z
    .string()
    .trim()
    .min(2, 'Mã cần ít nhất 2 ký tự.')
    .max(max, `Mã dài tối đa ${max} ký tự.`)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Mã chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');

/** Optional free text: blank becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Dài tối đa ${max} ký tự.`)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number().int().min(min, `Từ ${min} trở lên.`).max(max, `Tối đa ${max}.`).nullable(),
  );

const uuid = (message: string) => z.string().uuid(message);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ.')
  .nullish()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

/* ───────────────────────────── universities ───────────────────────────── */

export const universityInputSchema = z.object({
  code: code(16).transform((v) => v.toUpperCase()),
  name: name('Tên tiếng Anh'),
  nameVi: name('Tên tiếng Việt'),
  city: name('Thành phố', 80),
  region: z.enum(REGIONS),
  kind: z.enum(UNIVERSITY_KINDS),
  foundedYear: optionalInt(1800, 2100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Màu dạng #RRGGBB.'),
  description: optionalText(1000),
  /** FPT-style teaching periods, e.g. ["Block 10", "Block 3"]. */
  periods: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});
export type UniversityInput = z.infer<typeof universityInputSchema>;
export const universityUpdateSchema = universityInputSchema.partial();

/* ─────────────────────────────── faculties ─────────────────────────────── */

export const facultyInputSchema = z.object({
  universityId: uuid('Chọn trường.'),
  code: code(16).transform((v) => v.toUpperCase()),
  name: name('Tên tiếng Anh'),
  nameVi: name('Tên tiếng Việt'),
});
export type FacultyInput = z.infer<typeof facultyInputSchema>;
export const facultyUpdateSchema = facultyInputSchema.omit({ universityId: true }).partial();

/* ──────────────────────────────── majors ───────────────────────────────── */

export const majorInputSchema = z.object({
  facultyId: uuid('Chọn khoa.'),
  code: code(16).transform((v) => v.toUpperCase()),
  name: name('Tên tiếng Anh'),
  nameVi: name('Tên tiếng Việt'),
  totalCredits: z.coerce.number().int().min(1, 'Ít nhất 1 tín chỉ.').max(400),
  passMark: z.coerce.number().min(0).max(10),
  termCount: z.coerce.number().int().min(1, 'Ít nhất 1 kỳ.').max(20, 'Tối đa 20 kỳ.'),
});
export type MajorInput = z.infer<typeof majorInputSchema>;
export const majorUpdateSchema = majorInputSchema.partial();

/* ─────────────────────────── academic terms ───────────────────────────── */

export const academicTermInputSchema = z.object({
  universityId: uuid('Chọn trường.'),
  code: code(16).transform((v) => v.toUpperCase()),
  name: name('Tên kỳ', 60),
  schoolYear: z
    .string()
    .trim()
    .regex(/^\d{4}\s*[–-]\s*\d{4}$/, 'Năm học dạng 2025–2026.')
    .transform((v) => v.replace(/\s*[–-]\s*/, '–')),
  semester: z.enum(SEMESTERS),
  startsOn: isoDate,
  endsOn: isoDate,
});
export type AcademicTermInput = z.infer<typeof academicTermInputSchema>;
export const academicTermUpdateSchema = academicTermInputSchema.omit({ universityId: true }).partial();

/* ─────────────────────────────── subjects ──────────────────────────────── */

const lines = (max: number) =>
  z
    .array(z.string().trim().max(240))
    .max(max)
    .default([])
    .transform((list) => list.filter(Boolean));

export const subjectInputSchema = z.object({
  universityId: uuid('Chọn trường.'),
  facultyId: z
    .string()
    .uuid()
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  code: code(24),
  name: name('Tên tiếng Anh', 200),
  nameVi: name('Tên tiếng Việt', 200),
  credits: z.coerce.number().int().min(0).max(30),
  typicalYear: optionalInt(1, 8),
  typicalSemester: z
    .enum(SEMESTERS)
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  description: optionalText(4000),
  assessment: optionalText(1000),
  topics: lines(60),
  outcomes: lines(30),
  passCriteria: passCriteriaSchema.optional(),
  assessmentScheme: assessmentSchemeSchema.optional(),
});
export type SubjectInput = z.infer<typeof subjectInputSchema>;
export const subjectUpdateSchema = subjectInputSchema.omit({ universityId: true }).partial();

/* ────────────────────────────── curriculum ─────────────────────────────── */

const scoreRule = z.union([z.literal('pass'), z.number().min(0).max(10)]);
const subjectCode = z.string().trim().min(1).max(24);
const label = z.string().trim().max(160).optional();

/** The planner's rule tree, validated all the way down. */
export const requirementSchema: z.ZodType<Requirement> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('subject'), codes: z.array(subjectCode).min(1, 'Chọn ít nhất một môn.').max(8), min: scoreRule }),
    z
      .object({
        kind: z.literal('atLeast'),
        count: z.number().int().min(1),
        of: z.array(requirementSchema).min(1).max(16),
        label,
      })
      .refine((r) => r.count <= r.of.length, { message: 'Số môn cần đạt lớn hơn số điều kiện trong nhóm.' }),
    z.object({
      kind: z.literal('maxDebt'),
      terms: z.array(z.number().int().min(1).max(20)).min(1, 'Chọn ít nhất một kỳ.'),
      maxSubjects: z.number().int().min(0).max(60),
      maxCredits: z.number().int().min(0).max(200).optional(),
      label,
    }),
    z.object({
      kind: z.literal('avgScore'),
      groups: z.array(z.array(subjectCode).min(1)).min(1).max(16),
      min: z.number().min(0).max(10),
      label,
    }),
    z.object({ kind: z.literal('all'), of: z.array(requirementSchema).min(1).max(16), label }),
  ]),
);

export const curriculumEntrySchema = z.object({
  termNo: z.coerce.number().int().min(1).max(20).nullable(),
  isRequired: z.boolean().default(true),
  choiceGroup: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v : null)),
  requirements: z.array(requirementSchema).max(24).default([]),
  /** Pass conditions belong to the subject itself, so they apply in every programme. */
  passCriteria: passCriteriaSchema.optional(),
  assessmentScheme: assessmentSchemeSchema.optional(),
});
export type CurriculumEntryInput = z.infer<typeof curriculumEntrySchema>;
export const curriculumEntryUpdateSchema = curriculumEntrySchema.partial();

export const curriculumAddSchema = curriculumEntrySchema.extend({
  subjectId: uuid('Chọn môn.'),
});
export type CurriculumAddInput = z.infer<typeof curriculumAddSchema>;

/* ──────────────────────────────── folders ──────────────────────────────── */

/** Folders nest at most this deep: "Đề thi / Cuối kỳ / 2025". */
export const MAX_FOLDER_DEPTH = 3;

export const folderInputSchema = z.object({
  subjectId: uuid('Chọn môn.'),
  parentId: z
    .string()
    .uuid()
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  name: z.string().trim().min(1, 'Đặt tên thư mục.').max(80, 'Tên thư mục dài tối đa 80 ký tự.'),
});
export type FolderInput = z.infer<typeof folderInputSchema>;

export const folderUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Đặt tên thư mục.').max(80).optional(),
  parentId: z.string().uuid().nullable().optional(),
  position: z.coerce.number().int().min(0).max(10_000).optional(),
});
export type FolderUpdate = z.infer<typeof folderUpdateSchema>;

export const moveDocumentsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một tài liệu.').max(200),
  /** null takes them out of every folder. */
  folderId: z.string().uuid().nullable(),
});
export type MoveDocumentsInput = z.infer<typeof moveDocumentsSchema>;

/* ─────────────────────────────── documents ─────────────────────────────── */

export const adminDocumentQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  universityId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
  format: z.enum(FILE_FORMATS).optional(),
  /** A folder id, or "none" for documents in no folder. */
  folderId: z.string().optional(),
  sort: z.enum(['recent', 'downloads', 'title']).default('recent'),
  ...page,
});
export type AdminDocumentQuery = z.infer<typeof adminDocumentQuerySchema>;

export const adminDocumentUpdateSchema = updateDocumentSchema.extend({
  status: z.enum(DOCUMENT_STATUSES).optional(),
  /** Only for LINK and GITHUB documents: point the document at a new address. */
  linkUrl: z.string().trim().url('Dán một liên kết hợp lệ.').max(2000).optional(),
});
export type AdminDocumentUpdate = z.infer<typeof adminDocumentUpdateSchema>;

export const DOCUMENT_BULK_ACTIONS = ['publish', 'reject', 'remove', 'delete'] as const;
export type DocumentBulkAction = (typeof DOCUMENT_BULK_ACTIONS)[number];
export const documentBulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một tài liệu.').max(100),
  action: z.enum(DOCUMENT_BULK_ACTIONS),
});
export type DocumentBulkInput = z.infer<typeof documentBulkSchema>;

/* ──────────────────────────────── users ───────────────────────────────── */

export const adminUserQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(ROLES).optional(),
  universityId: z.string().uuid().optional(),
  activity: z.enum(ACTIVITY_FILTERS).optional(),
  sort: z.enum(['recent', 'active']).optional(),
  ...page,
});
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const userRoleSchema = z.object({ role: z.enum(ROLES) });

export const activityQuerySchema = z.object({
  entity: z.string().max(24).optional(),
  ...page,
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/* ──────────────────────────────── shapes ──────────────────────────────── */

export type TermState = 'current' | 'upcoming' | 'past' | 'undated';

export interface AcademicTermDto {
  id: string;
  universityId: string;
  code: string;
  name: string;
  schoolYear: string;
  semester: Semester;
  startsOn: string | null;
  endsOn: string | null;
  state: TermState;
  documentCount?: number;
}

export interface AdminUniversityDto extends UniversityDto {
  facultyCount: number;
  majorCount: number;
  subjectCount: number;
  termCount: number;
  userCount: number;
  documentCount: number;
  createdAt: string;
}

export interface AdminMajorDto extends MajorDto {
  termCount: number;
  passMark: number;
  totalCredits: number;
  subjectCount: number;
  /** Credits of the subjects currently in the curriculum. */
  plannedCredits: number;
  studentCount: number;
}

export interface AdminFacultyDto {
  id: string;
  code: string;
  name: string;
  nameVi: string;
  universityId: string;
  subjectCount: number;
  majors: AdminMajorDto[];
}

export interface AdminSubjectDto extends SubjectSummaryDto {
  facultyId: string | null;
  faculty: { id: string; code: string; nameVi: string } | null;
  description: string | null;
  assessment: string | null;
  topics: string[];
  outcomes: string[];
  documentCount: number;
  /** Programmes that include the subject. */
  programmes: Array<{ majorId: string; majorCode: string; majorName: string; termNo: number | null }>;
  updatedAt: string;
}

export interface AdminDocumentDto extends DocumentSummaryDto {
  fileUrl: string;
  updatedAt: string;
}

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  year: number | null;
  university: Pick<UniversityDto, 'id' | 'code' | 'name' | 'color'> | null;
  major: { id: string; name: string } | null;
  uploadCount: number;
  signInMethods: SignInMethod[];
  lastSeenAt: string | null;
  online: boolean;
  createdAt: string;
}

export interface ActivityDto {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
}

export interface AdminOverviewDto {
  counts: {
    universities: number;
    faculties: number;
    majors: number;
    subjects: number;
    terms: number;
    documents: number;
    users: number;
  };
  documentsByStatus: Record<DocumentStatus, number>;
  usersByRole: Record<Role, number>;
  /** Documents created per week, oldest first, last 8 weeks. */
  uploadsByWeek: Array<{ weekStart: string; count: number }>;
  topUniversities: Array<{ id: string; code: string; name: string; color: string; documents: number }>;
  pending: AdminDocumentDto[];
  recentActivity: ActivityDto[];
}

/* ──────────────────────────── student grades ─────────────────────────────
 * Admins only: moderators review documents and never see anyone's scores. */

export const adminGradesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  universityId: z.string().uuid().optional(),
  majorId: z.string().uuid().optional(),
  standing: z.enum(['all', 'failing', 'warning', 'good']).default('all'),
  sort: z.enum(['updated', 'gpa_desc', 'gpa_asc', 'name']).default('updated'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminGradesQuery = z.infer<typeof adminGradesQuerySchema>;

export interface AdminStudentGradeRowDto {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  university: { id: string; code: string } | null;
  major: { id: string; code: string; nameVi: string } | null;
  year: number | null;
  gpa4: number;
  gpa10: number;
  classification: string;
  earnedCredits: number;
  totalCredits: number;
  gradedCount: number;
  failedCount: number;
  inProgressCount: number;
  updatedAt: string;
}

export interface AdminGradesOverviewDto {
  items: AdminStudentGradeRowDto[];
  total: number;
  page: number;
  totalPages: number;
  /** Across every student with grades, not just this page. */
  stats: { students: number; avgGpa4: number; failing: number; gradedSubjects: number };
}

export interface AdminUserGradeDto {
  subject: { id: string; code: string; name: string; nameVi: string; credits: number };
  score10: number | null;
  termNo: number | null;
  inProgress: boolean;
  letter: string | null;
  gpa4: number | null;
  /** passed / failed / in_progress / blocked_by_conditions */
  outcome: 'passed' | 'failed' | 'in_progress' | 'conditions';
  criteria: Record<string, number | boolean>;
  passCriteria: import('./passCriteria.js').PassCriterion[];
  assessmentScheme: import('./assessment.js').AssessmentItem[];
  updatedAt: string;
}

export interface AdminUserGradesDto {
  summary: import('./grading.js').GpaSummary;
  passMark: number;
  major: { id: string; code: string; nameVi: string } | null;
  grades: AdminUserGradeDto[];
}
