import { z } from 'zod';
import type { DocumentSummaryDto } from './types.js';

/** Lecturer directory ("Tra cứu giảng viên"): looked up by students, kept by admins, linked from documents. */

/** Giảng viên teach; cán bộ are other school staff (phòng đào tạo, công tác sinh viên…). */
export const LECTURER_KINDS = ['LECTURER', 'STAFF'] as const;
export type LecturerKind = (typeof LECTURER_KINDS)[number];
export const LECTURER_KIND_LABELS: Record<LecturerKind, string> = { LECTURER: 'Giảng viên', STAFF: 'Cán bộ' };

export const LECTURER_GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type LecturerGender = (typeof LECTURER_GENDERS)[number];
export const LECTURER_GENDER_LABELS: Record<LecturerGender, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Kinds of profile links, picked from the address for the icon and default label. */
export const LECTURER_LINK_KINDS = ['github', 'linkedin', 'scholar', 'researchgate', 'orcid', 'facebook', 'youtube', 'website'] as const;
export type LecturerLinkKind = (typeof LECTURER_LINK_KINDS)[number];
export const LECTURER_LINK_LABELS: Record<LecturerLinkKind, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  scholar: 'Google Scholar',
  researchgate: 'ResearchGate',
  orcid: 'ORCID',
  facebook: 'Facebook',
  youtube: 'YouTube',
  website: 'Trang cá nhân',
};
export function lecturerLinkKind(url: string): LecturerLinkKind {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'website';
  }
  if (host === 'github.com' || host.endsWith('.github.io')) return 'github';
  if (host.endsWith('linkedin.com')) return 'linkedin';
  if (host === 'scholar.google.com' || host.startsWith('scholar.google.')) return 'scholar';
  if (host.endsWith('researchgate.net')) return 'researchgate';
  if (host === 'orcid.org') return 'orcid';
  if (host.endsWith('facebook.com') || host === 'fb.com') return 'facebook';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  return 'website';
}

export const lecturerLinkSchema = z.object({
  /** Shown instead of the site name, e.g. "Portfolio", "Blog". */
  label: optionalText(40),
  url: z
    .string()
    .trim()
    .max(500)
    .url('Liên kết không hợp lệ.')
    .refine((u) => /^https?:\/\//i.test(u), 'Liên kết phải bắt đầu bằng https://'),
});
export type LecturerLink = z.input<typeof lecturerLinkSchema>;

export const lecturerInputSchema = z.object({
  universityId: z.string().uuid('Chọn trường.'),
  kind: z.enum(LECTURER_KINDS).default('LECTURER'),
  /** Staff code at the school, e.g. HoangNT or GV0123. */
  code: z
    .string()
    .trim()
    .min(1, 'Nhập mã giảng viên.')
    .max(32, 'Mã tối đa 32 ký tự.')
    .regex(/^[\p{L}\p{N}._-]+$/u, 'Mã chỉ gồm chữ, số, dấu chấm, gạch.'),
  fullName: z.string().trim().min(2, 'Nhập họ và tên.').max(120),
  /** Bộ môn. */
  department: optionalText(160),
  gender: z.enum(LECTURER_GENDERS).nullish().transform((v) => v ?? null),
  phone: optionalText(32).refine((v) => !v || /^[+\d][\d\s.()-]{5,30}$/.test(v), 'Số điện thoại không hợp lệ.'),
  email: optionalText(160).refine((v) => !v || z.string().email().safeParse(v).success, 'Email không hợp lệ.'),
  description: optionalText(2000),
  /** Portfolio, GitHub, LinkedIn, Google Scholar… */
  links: z.array(lecturerLinkSchema).max(10, 'Tối đa 10 liên kết.').default([]),
});
export type LecturerInput = z.input<typeof lecturerInputSchema>;
export const lecturerUpdateSchema = lecturerInputSchema.partial();
export type LecturerUpdate = z.input<typeof lecturerUpdateSchema>;

export const lecturerQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  universityId: z.string().uuid().optional(),
  department: z.string().trim().max(160).optional(),
  kind: z.enum(LECTURER_KINDS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
export type LecturerQuery = z.input<typeof lecturerQuerySchema>;

/** Many lecturers at once, pasted from a spreadsheet (see parseLecturerSheet). */
export const lecturerImportSchema = z.object({
  universityId: z.string().uuid('Chọn trường.'),
  rows: z.array(lecturerInputSchema.omit({ universityId: true })).min(1).max(2000),
  /** Rows whose code already exists: update them, or leave them as they are. */
  onExisting: z.enum(['update', 'skip']).default('update'),
});
export type LecturerImport = z.input<typeof lecturerImportSchema>;

export interface LecturerDto {
  id: string;
  kind: LecturerKind;
  code: string;
  fullName: string;
  department: string | null;
  gender: LecturerGender | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  links: Array<{ label: string | null; url: string; kind: LecturerLinkKind }>;
  university: { id: string; code: string; nameVi: string; color: string };
  /** Documents on Kaned linked to this lecturer. */
  documentCount: number;
}

export interface LecturerDetailDto extends LecturerDto {
  /** Subjects of the documents linked to this lecturer, most documents first. */
  subjects: Array<{ id: string; code: string; nameVi: string; count: number }>;
  documents: DocumentSummaryDto[];
}

export interface LecturerImportResult {
  created: number;
  updated: number;
  skipped: number;
}

const HEADERS: Record<string, keyof z.input<typeof lecturerImportSchema>['rows'][number]> = {
  ma: 'code', 'ma gv': 'code', 'ma giang vien': 'code', code: 'code',
  'ho ten': 'fullName', 'ho va ten': 'fullName', ten: 'fullName', 'full name': 'fullName', name: 'fullName',
  'bo mon': 'department', department: 'department', khoa: 'department',
  'gioi tinh': 'gender', gender: 'gender',
  sdt: 'phone', 'so dien thoai': 'phone', 'dien thoai': 'phone', phone: 'phone',
  email: 'email', mail: 'email',
  'mo ta': 'description', 'ghi chu': 'description', description: 'description',
  loai: 'kind', 'vai tro': 'kind', 'chuc danh': 'kind', 'phan loai': 'kind', kind: 'kind', role: 'kind',
  'lien ket': 'links', links: 'links', link: 'links', website: 'links', portfolio: 'links', github: 'links',
};
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

export const kindFromText = (s: string): LecturerKind => {
  const f = fold(s);
  return /can bo|nhan vien|staff|chuyen vien/.test(f) ? 'STAFF' : 'LECTURER';
};

export const genderFromText = (s: string): LecturerGender | null => {
  const f = fold(s);
  if (!f) return null;
  if (['nam', 'male', 'm', 'thay'].includes(f)) return 'MALE';
  if (['nu', 'female', 'f', 'co'].includes(f)) return 'FEMALE';
  return 'OTHER';
};

/**
 * Rows pasted from Excel or Google Sheets (tab separated) or a CSV file.
 * The first line names the columns: Mã, Họ tên, Bộ môn, Giới tính, SĐT,
 * Email, Mô tả, in any order; without it the columns are taken in that order.
 */
export function parseLecturerSheet(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return { rows: [], issues: [] as string[] };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const split = (l: string) => {
    if (sep !== ',') return l.split(sep).map((c) => c.trim());
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        if (q && l[i + 1] === '"') (cur += '"'), i++;
        else q = !q;
      } else if (c === ',' && !q) out.push(cur.trim()), (cur = '');
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const first = split(lines[0]).map(fold);
  const hasHeader = first.some((h) => HEADERS[h]);
  const order = hasHeader
    ? first.map((h) => HEADERS[h] ?? null)
    : (['code', 'fullName', 'department', 'gender', 'phone', 'email', 'description', 'links'] as const).slice();
  const rows: z.input<typeof lecturerImportSchema>['rows'] = [];
  const issues: string[] = [];
  (hasHeader ? lines.slice(1) : lines).forEach((line, i) => {
    const cells = split(line);
    const raw: Record<string, string> = {};
    order.forEach((k, j) => {
      if (!k || cells[j] === undefined) return;
      // Several link columns (Website, GitHub…) add up.
      raw[k] = k === 'links' && raw.links ? `${raw.links} ${cells[j]}` : cells[j];
    });
    const row = {
      kind: raw.kind ? kindFromText(raw.kind) : ('LECTURER' as const),
      code: raw.code ?? '',
      fullName: raw.fullName ?? '',
      department: raw.department || null,
      gender: raw.gender ? genderFromText(raw.gender) : null,
      phone: raw.phone || null,
      email: raw.email || null,
      description: raw.description || null,
      links: (raw.links ?? '')
        .split(/[\s;|]+/)
        .filter((u) => /^https?:\/\//i.test(u))
        .slice(0, 10)
        .map((url) => ({ url, label: null })),
    };
    const ok = lecturerInputSchema.omit({ universityId: true }).safeParse(row);
    if (ok.success) rows.push(row);
    else issues.push(`Dòng ${i + (hasHeader ? 2 : 1)}: ${ok.error.issues[0].message}`);
  });
  return { rows, issues };
}
