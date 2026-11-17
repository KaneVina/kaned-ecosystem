import type { PassCriteriaValues, PassCriterion } from './passCriteria.js';
import type { AssessmentItem } from './assessment.js';
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
import type { OAuthProviderId } from './oauth.js';
import type { Requirement } from './planner.js';

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
  /** Teaching periods inside a term (FPT blocks); empty when the school has none. */
  periods: string[];
  documentCount?: number;
}

export interface FacultyDto {
  id: string;
  code: string;
  name: string;
  nameVi: string;
  universityId: string;
  university?: Pick<UniversityDto, 'id' | 'code' | 'name' | 'nameVi' | 'color'>;
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
  /** Score a subject needs to count as passed in this programme. */
  passMark?: number;
  /** Terms in the programme, Kỳ 1…N. */
  termCount?: number;
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
  university?: Pick<UniversityDto, 'id' | 'code' | 'name' | 'nameVi' | 'color'>;
  documentCount?: number;
}

export interface SubjectPrereqDto {
  type: PrereqType;
  /** Minimum score on the 10-point scale; null means the subject must be passed. */
  minScore: number | null;
  subject: SubjectSummaryDto;
}

/** A subject as it sits in one programme: its term and what it requires there. */
export interface CurriculumSubjectDto extends SubjectSummaryDto {
  termNo: number | null;
  isRequired: boolean;
  /** Subjects sharing a group are alternatives, e.g. thesis or capstone project. */
  choiceGroup: string | null;
  requirements: Requirement[];
  passCriteria: PassCriterion[];
  assessmentScheme: AssessmentItem[];
}

export interface CurriculumDto {
  major: MajorDto;
  subjects: CurriculumSubjectDto[];
}

export interface SubjectDetailDto extends SubjectSummaryDto {
  description: string | null;
  outcomes: string[];
  topics: string[];
  assessment: string | null;
  passCriteria: PassCriterion[];
  assessmentScheme: AssessmentItem[];
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
  university?: Pick<UniversityDto, 'id' | 'code' | 'name' | 'nameVi' | 'color'> | null;
  major?: Pick<MajorDto, 'id' | 'name'> | null;
  year: number | null;
  uploadCount?: number;
}

export interface CurrentUserDto extends UserSummaryDto {
  email: string;
  role: Role;
  bio: string | null;
  majorId: string | null;
  /** False for accounts created with an outside provider that never set one. */
  hasPassword: boolean;
  /** Outside accounts this account can sign in with. */
  providers: OAuthProviderId[];
  createdAt: string;
  stats?: {
    uploads: number;
    bookmarks: number;
    downloadsReceived: number;
    reviews: number;
  };
}

export interface DocumentSummaryDto {
  lecturer?: string | null;
  period?: string | null;
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
  university: Pick<UniversityDto, 'id' | 'code' | 'name' | 'nameVi' | 'color'>;
  uploader: UserSummaryDto;
  tags: string[];
  /** The address, for LINK documents only; files stay behind the download endpoint. */
  linkUrl: string | null;
  /** The university's own name for the term, e.g. "Spring 2026". */
  term: { id: string; code: string; name: string } | null;
  /** Folder inside the subject, e.g. "Đề thi". */
  folder: { id: string; name: string } | null;
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
  criteria: PassCriteriaValues;
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

/** A folder inside a subject. The list is flat; parentId builds the tree. */
export interface FolderDto {
  id: string;
  subjectId: string;
  parentId: string | null;
  name: string;
  position: number;
  /** Published documents directly inside this folder. */
  documentCount: number;
}
