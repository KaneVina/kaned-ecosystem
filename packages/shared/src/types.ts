/**
 * Shapes the API returns. The web app imports these instead of redeclaring
 * them, so a change to a response is a compile error on both sides.
 */
import type {
  DocumentStatus,
  DocumentType,
  FileFormat,
  PrereqType,
  Role,
  Semester,
} from './domain.js';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UniversityDto {
  id: string;
  code: string;
  name: string;
  nameVi: string;
  city: string;
  region: string;
  kind: string;
  foundedYear: number | null;
  color: string;
  description: string | null;
  documentCount?: number;
}

export interface FacultyDto {
  id: string;
  code: string;
  name: string;
  nameVi: string;
  universityId: string;
  university?: Pick<UniversityDto, 'id' | 'code' | 'name' | 'color'>;
  majors?: MajorDto[];
}

export interface MajorDto {
  id: string;
  code: string;
  name: string;
  nameVi: string;
  facultyId: string;
  faculty?: Pick<FacultyDto, 'id' | 'name' | 'nameVi' | 'universityId'>;
  totalCredits?: number;
  subjectCount?: number;
}

export interface SubjectSummaryDto {
  id: string;
  code: string;
  name: string;
  nameVi: string;
  credits: number;
  /** How many subjects must be cleared before this one. */
  prerequisiteCount?: number;
  typicalYear: number | null;
  typicalSemester: Semester | null;
  universityId: string;
  university?: Pick<UniversityDto, 'id' | 'code' | 'name' | 'color'>;
  documentCount?: number;
}

export interface SubjectPrereqDto {
  type: PrereqType;
  subject: SubjectSummaryDto;
}

export interface SubjectDetailDto extends SubjectSummaryDto {
  description: string | null;
  outcomes: string[];
  topics: string[];
  assessment: string | null;
  prerequisites: SubjectPrereqDto[];
  /** Subjects that list this one as a requirement. */
  unlocks: SubjectPrereqDto[];
  majors: Array<{ major: MajorDto; termNo: number | null; isRequired: boolean }>;
  documentCount: number;
  recentDocuments?: DocumentSummaryDto[];
}

export interface UserSummaryDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  universityId: string | null;
  university?: Pick<UniversityDto, 'id' | 'code' | 'name' | 'color'> | null;
  major?: Pick<MajorDto, 'id' | 'name'> | null;
  year: number | null;
  uploadCount?: number;
}

export interface CurrentUserDto extends UserSummaryDto {
  email: string;
  role: Role;
  bio: string | null;
  majorId: string | null;
  /** True when the account is linked to Google sign-in. */
  hasGoogle: boolean;
  createdAt: string;
  stats?: {
    uploads: number;
    bookmarks: number;
    downloadsReceived: number;
    reviews: number;
  };
}

export interface DocumentSummaryDto {
  id: string;
  title: string;
  description: string;
  type: DocumentType;
  format: FileFormat;
  fileBytes: number;
  pages: number | null;
  thumbnailUrl: string | null;
  year: number;
  semester: Semester;
  schoolYear: string | null;
  language: string;
  downloads: number;
  views: number;
  ratingAvg: number;
  ratingCount: number;
  status: DocumentStatus;
  createdAt: string;
  subject: SubjectSummaryDto;
  university: Pick<UniversityDto, 'id' | 'code' | 'name' | 'color'>;
  uploader: UserSummaryDto;
  tags: string[];
  isBookmarked?: boolean;
}

export interface DocumentDetailDto extends DocumentSummaryDto {
  fileUrl: string;
  reviews: ReviewDto[];
  related: DocumentSummaryDto[];
  moreFromUploader: DocumentSummaryDto[];
}

export interface ReviewDto {
  id: string;
  score: number;
  comment: string;
  createdAt: string;
  user: UserSummaryDto;
}

export interface CollectionDto {
  id: string;
  name: string;
  documentCount: number;
  documentIds: string[];
}

export interface GradeDto {
  subjectId: string;
  score10: number | null;
  termNo: number | null;
  inProgress: boolean;
  subject: SubjectSummaryDto;
}

export interface AuthResponse {
  user: CurrentUserDto;
  accessToken: string;
}

export interface ApiErrorBody {
  error: {
    message: string;
    code: string;
    /** Field-level messages keyed by form field name. */
    fields?: Record<string, string>;
  };
}

export interface UploadSignatureDto {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  /** When Cloudinary is not configured the API answers with a local fallback. */
  mode: 'cloudinary' | 'local';
  uploadUrl: string;
}
