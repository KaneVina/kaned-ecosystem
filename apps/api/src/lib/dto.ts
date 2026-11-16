import type {
  CurrentUserDto,
  DocumentSummaryDto,
  GradeDto,
  MajorDto,
  ReviewDto,
  SubjectSummaryDto,
  UniversityDto,
  UserSummaryDto,
  OAuthProviderId,
} from '@kaned/shared';
import { OAUTH_PROVIDERS } from '@kaned/shared';

/* ------------------------------------------------- relational query parts */

/** Reused by every query that needs an author card. */
export const userWith = {
  university: true,
  major: true,
} as const;

export const subjectWith = {
  university: true,
} as const;

export const documentWith = {
  university: true,
  subject: { with: subjectWith },
  uploader: { with: userWith },
  tags: { with: { tag: true } },
  term: true,
  folder: true,
} as const;

/* ------------------------------------------------------------- row shapes */

interface UniversityLike {
  id: string;
  code: string;
  name: string;
  nameVi: string;
  color: string;
}

interface UserLike {
  id: string;
  name: string;
  avatarUrl: string | null;
  year: number | null;
  universityId: string | null;
  university?: (UniversityLike & Record<string, unknown>) | null;
  major?: { id: string; name: string } | null;
}

interface SubjectLike {
  id: string;
  code: string;
  name: string;
  nameVi: string;
  credits: number;
  typicalYear: number | null;
  typicalSemester: 'S1' | 'S2' | 'SUMMER' | null;
  universityId: string;
  university?: (UniversityLike & Record<string, unknown>) | null;
}

interface DocumentLike {
  id: string;
  title: string;
  description: string;
  type: DocumentSummaryDto['type'];
  format: DocumentSummaryDto['format'];
  fileBytes: number;
  pages: number | null;
  thumbnailUrl: string | null;
  year: number;
  semester: DocumentSummaryDto['semester'];
  schoolYear: string | null;
  lecturer?: string | null;
  period?: string | null;
  language: string;
  downloads: number;
  views: number;
  ratingAvg: number;
  ratingCount: number;
  status: DocumentSummaryDto['status'];
  createdAt: Date;
  subject: SubjectLike;
  university: UniversityLike & Record<string, unknown>;
  uploader: UserLike;
  tags: Array<{ tag: { name: string } }>;
  fileUrl: string;
  term?: { id: string; code: string; name: string } | null;
  folder?: { id: string; name: string } | null;
}

/* --------------------------------------------------------------- mappers */

const brief = (u: UniversityLike): Pick<UniversityDto, 'id' | 'code' | 'name' | 'nameVi' | 'color'> => ({
  id: u.id,
  code: u.code,
  name: u.name,
  nameVi: u.nameVi,
  color: u.color,
});

export function toUserSummary(row: UserLike, uploadCount?: number): UserSummaryDto {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatarUrl,
    year: row.year,
    universityId: row.universityId,
    university: row.university ? brief(row.university) : null,
    major: row.major ? { id: row.major.id, name: row.major.name } : null,
    uploadCount,
  };
}

export function toCurrentUser(
  row: UserLike & {
    email: string;
    role: CurrentUserDto['role'];
    bio: string | null;
    majorId: string | null;
    passwordHash: string | null;
    identities?: Array<{ provider: string }>;
    createdAt: Date;
  },
  stats?: CurrentUserDto['stats'],
): CurrentUserDto {
  return {
    ...toUserSummary(row, stats?.uploads),
    email: row.email,
    role: row.role,
    bio: row.bio,
    majorId: row.majorId,
    hasPassword: Boolean(row.passwordHash),
    providers: (row.identities ?? [])
      .map((i) => i.provider)
      .filter((p): p is OAuthProviderId => (OAUTH_PROVIDERS as readonly string[]).includes(p)),
    createdAt: row.createdAt.toISOString(),
    stats,
  };
}

export function toSubjectSummary(
  row: SubjectLike,
  documentCount?: number,
  prerequisiteCount?: number,
): SubjectSummaryDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameVi: row.nameVi,
    credits: row.credits,
    prerequisiteCount,
    typicalYear: row.typicalYear,
    typicalSemester: row.typicalSemester,
    universityId: row.universityId,
    university: row.university ? brief(row.university) : undefined,
    documentCount,
  };
}

export function toDocumentSummary(
  row: DocumentLike,
  opts: { isBookmarked?: boolean } = {},
): DocumentSummaryDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    format: row.format,
    fileBytes: row.fileBytes,
    pages: row.pages,
    thumbnailUrl: row.thumbnailUrl,
    year: row.year,
    semester: row.semester,
    schoolYear: row.schoolYear,
    lecturer: row.lecturer ?? null,
    period: row.period ?? null,
    language: row.language,
    downloads: row.downloads,
    views: row.views,
    ratingAvg: Number(row.ratingAvg.toFixed(2)),
    ratingCount: row.ratingCount,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    subject: toSubjectSummary(row.subject),
    university: brief(row.university),
    uploader: toUserSummary(row.uploader),
    tags: row.tags.map((t) => t.tag.name),
    linkUrl: row.format === 'LINK' ? row.fileUrl : null,
    term: row.term ? { id: row.term.id, code: row.term.code, name: row.term.name } : null,
    folder: row.folder ? { id: row.folder.id, name: row.folder.name } : null,
    isBookmarked: opts.isBookmarked,
  };
}

export function toUniversity(
  row: UniversityLike & {
    nameVi: string;
    city: string;
    region: string;
    kind: string;
    foundedYear: number | null;
    description: string | null;
    periods?: string[] | null;
  },
  documentCount?: number,
): UniversityDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameVi: row.nameVi,
    city: row.city,
    region: row.region,
    kind: row.kind,
    foundedYear: row.foundedYear,
    color: row.color,
    description: row.description,
    periods: row.periods ?? [],
    documentCount,
  };
}

export function toMajor(
  row: {
    id: string;
    code: string;
    name: string;
    nameVi: string;
    facultyId: string;
    totalCredits: number;
    passMark?: number;
    termCount?: number;
    faculty?: { id: string; name: string; nameVi: string; universityId: string } | null;
  },
  subjectCount?: number,
): MajorDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameVi: row.nameVi,
    facultyId: row.facultyId,
    totalCredits: row.totalCredits,
    passMark: row.passMark,
    termCount: row.termCount,
    faculty: row.faculty ?? undefined,
    subjectCount,
  };
}

export function toReview(row: {
  id: string;
  score: number;
  comment: string;
  createdAt: Date;
  user: UserLike;
}): ReviewDto {
  return {
    id: row.id,
    score: row.score,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    user: toUserSummary(row.user),
  };
}

export function toGrade(row: {
  subjectId: string;
  score10: number | null;
  termNo: number | null;
  inProgress: boolean;
  subject: SubjectLike;
}): GradeDto {
  return {
    subjectId: row.subjectId,
    score10: row.score10,
    termNo: row.termNo,
    inProgress: row.inProgress,
    subject: toSubjectSummary(row.subject),
  };
}
