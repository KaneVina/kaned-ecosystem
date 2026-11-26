/**
 * Kaned Ecosystem — database schema (Drizzle ORM / PostgreSQL).
 *
 * The shape follows how a Vietnamese university is organised:
 *   University → Faculty → Major → Subject
 * with a curriculum table (majorSubjects) and a prerequisite graph
 * (subjectPrerequisites). A new module — flashcards, timetable, internships —
 * is a new table pointing at users and subjects; nothing here has to change.
 */
import { relations, sql } from 'drizzle-orm';
import type { AssessmentItem, DeckContent, DeckProgress, PassCriteriaValues, PassCriterion, PeStoredConfig, Requirement, VecSettings } from '@kaned/shared';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/* ──────────────────────────────── enums ─────────────────────────────── */

export const roleEnum = pgEnum('role', ['STUDENT', 'MODERATOR', 'ADMIN']);
export const documentTypeEnum = pgEnum('document_type', [
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
]);
/**
 * LINK: the document is a URL (Google Slides, Canva, YouTube…) instead of an uploaded file.
 * GITHUB: a GitHub repository, folder or file.
 */
export const fileFormatEnum = pgEnum('file_format', ['PDF', 'DOCX', 'PPTX', 'XLSX', 'HTML', 'MD', 'LINK', 'GITHUB', 'DRAWIO']);
export const documentStatusEnum = pgEnum('document_status', [
  'PENDING',
  'PUBLISHED',
  'REJECTED',
  'REMOVED',
]);
export const semesterEnum = pgEnum('semester', ['S1', 'S2', 'SUMMER']);
export const prereqTypeEnum = pgEnum('prereq_type', ['PREREQUISITE', 'COREQUISITE', 'PRIOR']);

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

/* ────────────────────────────── academia ────────────────────────────── */

export const universities = pgTable('universities', {
  id: id(),
  code: varchar('code', { length: 16 }).notNull().unique(),
  name: text('name').notNull(),
  nameVi: text('name_vi').notNull(),
  city: text('city').notNull(),
  region: varchar('region', { length: 16 }).notNull().default('south'),
  kind: varchar('kind', { length: 16 }).notNull().default('Public'),
  foundedYear: integer('founded_year'),
  color: varchar('color', { length: 9 }).notNull().default('#4433B4'),
  description: text('description'),
  /** Teaching periods inside a term, e.g. FPT blocks; shown on the upload form. */
  periods: jsonb('periods').$type<string[]>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const faculties = pgTable(
  'faculties',
  {
    id: id(),
    code: varchar('code', { length: 16 }).notNull(),
    name: text('name').notNull(),
    nameVi: text('name_vi').notNull(),
    universityId: text('university_id')
      .notNull()
      .references(() => universities.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqueCode: uniqueIndex('faculties_university_code_idx').on(t.universityId, t.code),
  }),
);

export const majors = pgTable(
  'majors',
  {
    id: id(),
    code: varchar('code', { length: 16 }).notNull(),
    name: text('name').notNull(),
    nameVi: text('name_vi').notNull(),
    totalCredits: integer('total_credits').notNull().default(145),
    /** Score a subject needs to count as passed. FPT University uses 5.0. */
    passMark: real('pass_mark').notNull().default(5),
    /** Terms in the programme (Kỳ 1…N). A term can exist before it has subjects. */
    termCount: integer('term_count').notNull().default(8),
    facultyId: text('faculty_id')
      .notNull()
      .references(() => faculties.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqueCode: uniqueIndex('majors_faculty_code_idx').on(t.facultyId, t.code),
  }),
);

/**
 * A school's own calendar terms: "Fall 2025", "HK1 2025–2026", "Học kỳ hè 2026".
 * Each maps onto the shared (schoolYear, semester) pair the library filters on,
 * so universities can name and date their terms however they like.
 */
export const academicTerms = pgTable(
  'academic_terms',
  {
    id: id(),
    universityId: text('university_id')
      .notNull()
      .references(() => universities.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 16 }).notNull(),
    name: text('name').notNull(),
    schoolYear: varchar('school_year', { length: 20 }).notNull(),
    semester: semesterEnum('semester').notNull(),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqueCode: uniqueIndex('academic_terms_university_code_idx').on(t.universityId, t.code),
  }),
);

/** Lecturer directory: looked up by students, linked from documents. */
export const lecturers = pgTable(
  'lecturers',
  {
    id: id(),
    universityId: text('university_id')
      .notNull()
      .references(() => universities.id, { onDelete: 'cascade' }),
    /** LECTURER (giảng viên) | STAFF (cán bộ) */
    kind: varchar('kind', { length: 12 }).notNull().default('LECTURER'),
    code: varchar('code', { length: 32 }).notNull(),
    fullName: text('full_name').notNull(),
    /** Bộ môn. */
    department: text('department'),
    /** MALE | FEMALE | OTHER */
    gender: varchar('gender', { length: 8 }),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 160 }),
    description: text('description'),
    /** Portfolio, GitHub, LinkedIn… as { label, url }. */
    links: jsonb('links').$type<Array<{ label: string | null; url: string }>>().notNull().default([]),
    /** Name, code, department and email without accents, lower case, for search. */
    search: text('search').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uniqueCode: uniqueIndex('lecturers_university_code_idx').on(t.universityId, t.code),
    universityIdx: index('lecturers_university_idx').on(t.universityId),
  }),
);

export const subjects = pgTable(
  'subjects',
  {
    id: id(),
    code: varchar('code', { length: 24 }).notNull(),
    name: text('name').notNull(),
    nameVi: text('name_vi').notNull(),
    credits: integer('credits').notNull().default(3),
    description: text('description'),
    assessment: text('assessment'),
    outcomes: text('outcomes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    topics: text('topics')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Extra pass conditions (FE ≥ 4, a Coursera certificate…), evaluated by @kaned/shared. */
    passCriteria: jsonb('pass_criteria').$type<PassCriterion[]>().notNull().default(sql`'[]'::jsonb`),
    /** Graded categories with weights and completion rules, as the syllabus lists them. */
    assessmentScheme: jsonb('assessment_scheme').$type<AssessmentItem[]>().notNull().default(sql`'[]'::jsonb`),
    typicalYear: integer('typical_year'),
    typicalSemester: semesterEnum('typical_semester'),
    universityId: text('university_id')
      .notNull()
      .references(() => universities.id, { onDelete: 'cascade' }),
    facultyId: text('faculty_id').references(() => faculties.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uniqueCode: uniqueIndex('subjects_university_code_idx').on(t.universityId, t.code),
    codeIdx: index('subjects_code_idx').on(t.code),
    facultyIdx: index('subjects_faculty_idx').on(t.facultyId),
  }),
);

/**
 * Folders inside a subject, so a subject's documents can be grouped:
 * "Đề thi" → "Giữa kỳ", "Cuối kỳ". Folders nest (parentId) up to a few levels
 * and keep the order admins give them (position).
 */
export const subjectFolders = pgTable(
  'subject_folders',
  {
    id: id(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnyPgColumn => subjectFolders.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({
    subjectIdx: index('subject_folders_subject_idx').on(t.subjectId),
    parentIdx: index('subject_folders_parent_idx').on(t.parentId),
  }),
);

/** Which subjects a major takes, and in which term. */
export const majorSubjects = pgTable(
  'major_subjects',
  {
    majorId: text('major_id')
      .notNull()
      .references(() => majors.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    termNo: integer('term_no'),
    isRequired: boolean('is_required').notNull().default(true),
    /**
     * What a student needs before registering, in this programme. Kept as
     * JSON because the rules are a small tree (pass / score floor /
     * alternatives / N-of-M / max debt / group average) that the shared
     * planner evaluates as a whole.
     */
    requirements: jsonb('requirements').$type<Requirement[]>().notNull().default(sql`'[]'::jsonb`),
    /** Subjects with the same group are alternatives, e.g. thesis or capstone. */
    choiceGroup: varchar('choice_group', { length: 40 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.majorId, t.subjectId] }),
    subjectIdx: index('major_subjects_subject_idx').on(t.subjectId),
  }),
);

/** "To take `subjectId`, you must first have `requiresId`." */
export const subjectPrerequisites = pgTable(
  'subject_prerequisites',
  {
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    requiresId: text('requires_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    type: prereqTypeEnum('type').notNull().default('PREREQUISITE'),
    /** Minimum score on the 10-point scale; null means the subject must be passed. */
    minScore: real('min_score'),
    note: text('note'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.subjectId, t.requiresId] }),
    requiresIdx: index('subject_prerequisites_requires_idx').on(t.requiresId),
  }),
);

/* ──────────────────────────────── people ────────────────────────────── */

export const users = pgTable(
  'users',
  {
    id: id(),
    email: varchar('email', { length: 190 }).notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    role: roleEnum('role').notNull().default('STUDENT'),
    year: integer('year'),
    /** Student number and class, optional; they fill the exam admit card. */
    studentCode: varchar('student_code', { length: 20 }),
    className: varchar('class_name', { length: 40 }),
    universityId: text('university_id').references(() => universities.id, { onDelete: 'set null' }),
    majorId: text('major_id').references(() => majors.id, { onDelete: 'set null' }),
    /** Last heartbeat from an open app tab; "online" means within the last two minutes. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    universityIdx: index('users_university_idx').on(t.universityId),
    lastSeenIdx: index('users_last_seen_idx').on(t.lastSeenAt),
  }),
);

/**
 * Outside accounts (Google, Microsoft, GitHub, Facebook) a user signs in with.
 * One row per provider account; a user has at most one account per provider.
 */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull(),
    /** The provider's stable id for the account (Google "sub", GitHub user id…). */
    providerUserId: varchar('provider_user_id', { length: 190 }).notNull(),
    email: varchar('email', { length: 190 }),
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    providerAccount: uniqueIndex('user_identities_provider_account_idx').on(t.provider, t.providerUserId),
    onePerProvider: uniqueIndex('user_identities_user_provider_idx').on(t.userId, t.provider),
  }),
);

/* ─────────────────────────────── activity ───────────────────────────── */

/**
 * One visit: a run of activity from one browser tab. It continues across
 * page loads as long as the tab keeps checking in; 30 minutes of silence
 * starts a new one.
 */
export const activitySessions = pgTable(
  'activity_sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Random id the tab keeps in sessionStorage. */
    clientId: varchar('client_id', { length: 64 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    /** Seconds the tab was visible and the person was not idle. */
    activeSeconds: integer('active_seconds').notNull().default(0),
    pageCount: integer('page_count').notNull().default(0),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 300 }),
    browser: varchar('browser', { length: 40 }),
    os: varchar('os', { length: 40 }),
    device: varchar('device', { length: 20 }),
  },
  (t) => ({
    userSeenIdx: index('activity_sessions_user_seen_idx').on(t.userId, t.lastSeenAt),
    clientIdx: index('activity_sessions_client_idx').on(t.userId, t.clientId),
  }),
);

/** One page, document or subject opened during a visit, with how long it was looked at. */
export const pageViews = pgTable(
  'page_views',
  {
    id: id(),
    sessionId: text('session_id')
      .notNull()
      .references(() => activitySessions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    path: varchar('path', { length: 300 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(),
    /** Document id or subject code, when the page is about one. */
    entityId: varchar('entity_id', { length: 120 }),
    /** What the page was called when it was viewed (a title can change later). */
    label: text('label'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    lastPingAt: timestamp('last_ping_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    seconds: integer('seconds').notNull().default(0),
  },
  (t) => ({
    userStartedIdx: index('page_views_user_started_idx').on(t.userId, t.startedAt),
    sessionIdx: index('page_views_session_idx').on(t.sessionId),
    entityIdx: index('page_views_entity_idx').on(t.kind, t.entityId),
  }),
);

/** Things a person did that are worth a line in their history: sign-ins, searches, downloads… */
export const userEvents = pgTable(
  'user_events',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 30 }).notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ip: varchar('ip', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => ({
    userCreatedIdx: index('user_events_user_created_idx').on(t.userId, t.createdAt),
    typeCreatedIdx: index('user_events_type_created_idx').on(t.type, t.createdAt),
  }),
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    userAgent: varchar('user_agent', { length: 190 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
  }),
);

/* ────────────────────────────── documents ───────────────────────────── */

export const documents = pgTable(
  'documents',
  {
    id: id(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    type: documentTypeEnum('type').notNull(),
    format: fileFormatEnum('format').notNull(),
    status: documentStatusEnum('status').notNull().default('PUBLISHED'),
    language: varchar('language', { length: 32 }).notNull().default('Vietnamese'),

    fileUrl: text('file_url').notNull(),
    filePublicId: text('file_public_id').notNull(),
    fileBytes: integer('file_bytes').notNull(),
    pages: integer('pages'),
    thumbnailUrl: text('thumbnail_url'),
    /** The uploader's notes on downloading and using it (GitHub documents). */
    guide: text('guide'),
    /** Lưu hành nội bộ: signed-in members only, original link hidden from viewers. */
    internal: boolean('internal').notNull().default(false),
    /** With internal: may viewers download the file or open the original link. */
    allowDownload: boolean('allow_download').notNull().default(true),
    /** With internal: may viewers use the share button. */
    allowShare: boolean('allow_share').notNull().default(true),

    year: integer('year').notNull(),
    semester: semesterEnum('semester').notNull(),
    schoolYear: varchar('school_year', { length: 20 }),
    lecturer: varchar('lecturer', { length: 120 }),
    lecturerId: text('lecturer_id').references(() => lecturers.id, { onDelete: 'set null' }),
    period: varchar('period', { length: 40 }),
    academicTermId: text('academic_term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    /** Optional folder inside the subject; deleting a folder moves its documents up (service) or out. */
    folderId: text('folder_id').references(() => subjectFolders.id, { onDelete: 'set null' }),

    universityId: text('university_id')
      .notNull()
      .references(() => universities.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    uploaderId: text('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    downloads: integer('downloads').notNull().default(0),
    views: integer('views').notNull().default(0),
    ratingAvg: real('rating_avg').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    subjectIdx: index('documents_subject_idx').on(t.subjectId),
    universityIdx: index('documents_university_idx').on(t.universityId),
    uploaderIdx: index('documents_uploader_idx').on(t.uploaderId),
    lecturerIdx: index('documents_lecturer_idx').on(t.lecturerId),
    typeIdx: index('documents_type_idx').on(t.type),
    downloadsIdx: index('documents_downloads_idx').on(t.downloads),
    statusCreatedIdx: index('documents_status_created_idx').on(t.status, t.createdAt),
    folderIdx: index('documents_folder_idx').on(t.folderId),
  }),
);

export const tags = pgTable('tags', {
  id: id(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
});

export const documentTags = pgTable(
  'document_tags',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.documentId, t.tagId] }),
    tagIdx: index('document_tags_tag_idx').on(t.tagId),
  }),
);

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    score: integer('score').notNull(),
    comment: text('comment').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uniquePair: uniqueIndex('reviews_user_document_idx').on(t.userId, t.documentId),
    documentIdx: index('reviews_document_idx').on(t.documentId),
  }),
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.documentId] }),
    documentIdx: index('bookmarks_document_idx').on(t.documentId),
  }),
);

export const collections = pgTable(
  'collections',
  {
    id: id(),
    name: varchar('name', { length: 60 }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqueName: uniqueIndex('collections_user_name_idx').on(t.userId, t.name),
  }),
);

export const collectionItems = pgTable(
  'collection_items',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    addedAt: createdAt(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.collectionId, t.documentId] }),
  }),
);

/* ──────────────────────────────── grades ────────────────────────────── */

export const grades = pgTable(
  'grades',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    score10: doublePrecision('score_10'),
    termNo: integer('term_no'),
    inProgress: boolean('in_progress').notNull().default(false),
    /** Component scores and ticked tasks, keyed by the subject's pass criterion id. */
    criteria: jsonb('criteria').$type<PassCriteriaValues>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.subjectId] }),
  }),
);

/* ─────────────────────────────── decks ──────────────────────────────── */

/**
 * Bộ đề ôn tập for a subject, written in the Kaned deck format. The file is
 * kept as written (source) beside what was read from it (content).
 */
export const decks = pgTable(
  'decks',
  {
    id: id(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    /** PUBLISHED | DRAFT */
    status: varchar('status', { length: 12 }).notNull().default('PUBLISHED'),
    source: text('source').notNull(),
    content: jsonb('content').$type<DeckContent>().notNull(),
    questionCount: integer('question_count').notNull().default(0),
    tipCount: integer('tip_count').notNull().default(0),
    chapterCount: integer('chapter_count').notNull().default(0),
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    subjectIdx: index('decks_subject_idx').on(t.subjectId),
  }),
);

/** One learner's progress in one deck, with counts kept beside it for lists. */
export const deckProgress = pgTable(
  'deck_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deckId: text('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    state: jsonb('state').$type<DeckProgress>().notNull(),
    seen: integer('seen').notNull().default(0),
    ok: integer('ok').notNull().default(0),
    bad: integer('bad').notNull().default(0),
    marked: integer('marked').notNull().default(0),
    /** Study sessions: a save 30 minutes or more after the last one starts a new session. */
    sessions: integer('sessions').notNull().default(1),
    /** Answers given in total (right + wrong, every question). */
    answers: integer('answers').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.deckId] }),
    deckIdx: index('deck_progress_deck_idx').on(t.deckId),
  }),
);

/* ─────────────────────────────── admin ──────────────────────────────── */

/** What admins changed and when — the dashboard's activity feed. */
export const adminActivity = pgTable(
  'admin_activity',
  {
    id: id(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** create | update | delete | publish | reject | remove | role */
    action: varchar('action', { length: 24 }).notNull(),
    /** university | faculty | major | term | subject | curriculum | document | user */
    entity: varchar('entity', { length: 24 }).notNull(),
    entityId: text('entity_id'),
    summary: text('summary').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    createdIdx: index('admin_activity_created_idx').on(t.createdAt),
  }),
);

/**
 * Idempotency-Key ledger. A state-changing request carries a client-chosen
 * key; the first request with that key runs and its response is kept here, and
 * any repeat (a double click, a retry after a dropped connection) gets the
 * same response back instead of running twice. Keys are per caller and expire.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    /** The caller: a user id, or "ip:<address>" for anonymous calls. */
    scope: varchar('scope', { length: 80 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    method: varchar('method', { length: 8 }).notNull(),
    path: text('path').notNull(),
    /** sha256 of method, path and body: the same key must mean the same request. */
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    /** processing while the first request runs, then done. */
    state: varchar('state', { length: 12 }).notNull().default('processing'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scope, t.key] }),
    expiresIdx: index('idempotency_keys_expires_idx').on(t.expiresAt),
  }),
);

/** Small key/value store for the app itself, e.g. which seed version ran. */
export const appMeta = pgTable('app_meta', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: updatedAt(),
});

/* ─────────────────────────────── relations ──────────────────────────── */

export const universityRelations = relations(universities, ({ many }) => ({
  faculties: many(faculties),
  terms: many(academicTerms),
  subjects: many(subjects),
  documents: many(documents),
  users: many(users),
}));

export const facultyRelations = relations(faculties, ({ one, many }) => ({
  university: one(universities, {
    fields: [faculties.universityId],
    references: [universities.id],
  }),
  majors: many(majors),
  subjects: many(subjects),
}));

export const majorRelations = relations(majors, ({ one, many }) => ({
  faculty: one(faculties, { fields: [majors.facultyId], references: [faculties.id] }),
  curriculum: many(majorSubjects),
  users: many(users),
}));

export const subjectRelations = relations(subjects, ({ one, many }) => ({
  university: one(universities, {
    fields: [subjects.universityId],
    references: [universities.id],
  }),
  faculty: one(faculties, { fields: [subjects.facultyId], references: [faculties.id] }),
  curriculum: many(majorSubjects),
  documents: many(documents),
  grades: many(grades),
  prerequisites: many(subjectPrerequisites, { relationName: 'subjectRequires' }),
  unlocks: many(subjectPrerequisites, { relationName: 'subjectUnlocks' }),
}));

export const subjectFolderRelations = relations(subjectFolders, ({ one, many }) => ({
  subject: one(subjects, { fields: [subjectFolders.subjectId], references: [subjects.id] }),
  documents: many(documents),
}));

export const academicTermRelations = relations(academicTerms, ({ one, many }) => ({
  university: one(universities, {
    fields: [academicTerms.universityId],
    references: [universities.id],
  }),
  documents: many(documents),
}));

export const adminActivityRelations = relations(adminActivity, ({ one }) => ({
  actor: one(users, { fields: [adminActivity.actorId], references: [users.id] }),
}));

export const majorSubjectRelations = relations(majorSubjects, ({ one }) => ({
  major: one(majors, { fields: [majorSubjects.majorId], references: [majors.id] }),
  subject: one(subjects, { fields: [majorSubjects.subjectId], references: [subjects.id] }),
}));

export const subjectPrerequisiteRelations = relations(subjectPrerequisites, ({ one }) => ({
  subject: one(subjects, {
    fields: [subjectPrerequisites.subjectId],
    references: [subjects.id],
    relationName: 'subjectRequires',
  }),
  requires: one(subjects, {
    fields: [subjectPrerequisites.requiresId],
    references: [subjects.id],
    relationName: 'subjectUnlocks',
  }),
}));

export const userRelations = relations(users, ({ one, many }) => ({
  university: one(universities, { fields: [users.universityId], references: [universities.id] }),
  major: one(majors, { fields: [users.majorId], references: [majors.id] }),
  documents: many(documents),
  bookmarks: many(bookmarks),
  reviews: many(reviews),
  grades: many(grades),
  collections: many(collections),
  identities: many(userIdentities),
  activitySessions: many(activitySessions),
  pageViews: many(pageViews),
  events: many(userEvents),
}));

export const activitySessionRelations = relations(activitySessions, ({ one, many }) => ({
  user: one(users, { fields: [activitySessions.userId], references: [users.id] }),
  views: many(pageViews),
}));

export const pageViewRelations = relations(pageViews, ({ one }) => ({
  session: one(activitySessions, { fields: [pageViews.sessionId], references: [activitySessions.id] }),
  user: one(users, { fields: [pageViews.userId], references: [users.id] }),
}));

export const userEventRelations = relations(userEvents, ({ one }) => ({
  user: one(users, { fields: [userEvents.userId], references: [users.id] }),
}));

export const userIdentityRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, { fields: [userIdentities.userId], references: [users.id] }),
}));

export const documentRelations = relations(documents, ({ one, many }) => ({
  university: one(universities, {
    fields: [documents.universityId],
    references: [universities.id],
  }),
  subject: one(subjects, { fields: [documents.subjectId], references: [subjects.id] }),
  uploader: one(users, { fields: [documents.uploaderId], references: [users.id] }),
  term: one(academicTerms, { fields: [documents.academicTermId], references: [academicTerms.id] }),
  folder: one(subjectFolders, { fields: [documents.folderId], references: [subjectFolders.id] }),
  lecturerRef: one(lecturers, { fields: [documents.lecturerId], references: [lecturers.id] }),
  tags: many(documentTags),
  reviews: many(reviews),
  bookmarks: many(bookmarks),
}));

export const documentTagRelations = relations(documentTags, ({ one }) => ({
  document: one(documents, { fields: [documentTags.documentId], references: [documents.id] }),
  tag: one(tags, { fields: [documentTags.tagId], references: [tags.id] }),
}));

export const tagRelations = relations(tags, ({ many }) => ({
  documents: many(documentTags),
}));

export const reviewRelations = relations(reviews, ({ one }) => ({
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  document: one(documents, { fields: [reviews.documentId], references: [documents.id] }),
}));

export const bookmarkRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
  document: one(documents, { fields: [bookmarks.documentId], references: [documents.id] }),
}));

export const collectionRelations = relations(collections, ({ one, many }) => ({
  user: one(users, { fields: [collections.userId], references: [users.id] }),
  items: many(collectionItems),
}));

export const collectionItemRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionItems.collectionId],
    references: [collections.id],
  }),
  document: one(documents, { fields: [collectionItems.documentId], references: [documents.id] }),
}));

export const deckRelations = relations(decks, ({ one, many }) => ({
  subject: one(subjects, { fields: [decks.subjectId], references: [subjects.id] }),
  createdBy: one(users, { fields: [decks.createdById], references: [users.id] }),
  progress: many(deckProgress),
}));

export const deckProgressRelations = relations(deckProgress, ({ one }) => ({
  user: one(users, { fields: [deckProgress.userId], references: [users.id] }),
  deck: one(decks, { fields: [deckProgress.deckId], references: [decks.id] }),
}));

export const gradeRelations = relations(grades, ({ one }) => ({
  user: one(users, { fields: [grades.userId], references: [users.id] }),
  subject: one(subjects, { fields: [grades.subjectId], references: [subjects.id] }),
}));

/* ──────────────────────────────── types ─────────────────────────────── */

export type UserRow = typeof users.$inferSelect;
export type UserIdentityRow = typeof userIdentities.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type SubjectRow = typeof subjects.$inferSelect;
export type UniversityRow = typeof universities.$inferSelect;
export type MajorRow = typeof majors.$inferSelect;
export type GradeRow = typeof grades.$inferSelect;
export type AcademicTermRow = typeof academicTerms.$inferSelect;
export type FacultyRow = typeof faculties.$inferSelect;
export type SubjectFolderRow = typeof subjectFolders.$inferSelect;
export type DeckRow = typeof decks.$inferSelect;

export const lecturerRelations = relations(lecturers, ({ one, many }) => ({
  university: one(universities, { fields: [lecturers.universityId], references: [universities.id] }),
  documents: many(documents),
}));


/* ───────────────────────── VEC – Virtual Exam Center ─────────────────────────
 * Server-held exam sessions. Correct answers live only in vecSessionQuestions
 * and are never selected for a candidate. See docs/vec for the full spec.
 */

export const vecSessions = pgTable(
  'vec_sessions',
  {
    id: id(),
    hostId: text('host_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** FE (multiple choice) | PE (practical, planned) */
    kind: varchar('kind', { length: 2 }).notNull().default('FE'),
    title: text('title').notNull(),
    description: text('description'),
    instructions: text('instructions'),
    lecturerDisplay: text('lecturer_display').notNull(),
    subjectCode: varchar('subject_code', { length: 24 }).notNull(),
    subjectName: text('subject_name').notNull(),
    universityId: text('university_id'),
    deckId: text('deck_id'),
    /** The questions came from an uploaded .md file that was not kept. */
    ephemeral: boolean('ephemeral').notNull().default(false),
    roomCode: varchar('room_code', { length: 7 }).notNull(),
    otpEnc: text('otp_enc'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    durationMin: integer('duration_min').notNull(),
    lobbyOpenMin: integer('lobby_open_min').notNull().default(15),
    lateJoinMin: integer('late_join_min').notNull().default(10),
    /** PAUSED | ENDED | CANCELLED | DELETING; null means "follow the clock". */
    statusOverride: varchar('status_override', { length: 12 }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    pausedTotalSec: integer('paused_total_sec').notNull().default(0),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: varchar('end_reason', { length: 16 }),
    questionCount: integer('question_count').notNull().default(0),
    settings: jsonb('settings').$type<VecSettings>().notNull(),
    /** PE rooms: exam code, paper, materials and submission rules. */
    pe: jsonb('pe').$type<PeStoredConfig>(),
    resultsReleasedAt: timestamp('results_released_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    hostIdx: index('vec_sessions_host_idx').on(t.hostId, t.startsAt),
    expiresIdx: index('vec_sessions_expires_idx').on(t.expiresAt),
    activeCodeIdx: uniqueIndex('vec_active_room_code')
      .on(t.roomCode)
      .where(sql`${t.statusOverride} IS NULL OR ${t.statusOverride} = 'PAUSED'`),
  }),
);

/** Frozen copy of the questions, with the answer key. Only the server reads `answers`. */
export const vecSessionQuestions = pgTable(
  'vec_session_questions',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => vecSessions.id, { onDelete: 'cascade' }),
    qid: varchar('qid', { length: 24 }).notNull(),
    position: integer('position').notNull(),
    chapter: integer('chapter').notNull().default(0),
    kind: varchar('kind', { length: 8 }).notNull(),
    text: text('text').notNull(),
    options: jsonb('options').$type<string[]>().notNull(),
    answers: jsonb('answers').$type<number[]>().notNull(),
    canShuffle: boolean('can_shuffle').notNull().default(true),
    explain: text('explain'),
    note: text('note'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.qid] }) }),
);

export const vecParticipants = pgTable(
  'vec_participants',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => vecSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** What the candidate typed in step 1, plus the original account name for comparison. */
    candidateInfo: jsonb('candidate_info').$type<Record<string, string>>().notNull(),
    consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
    extraRetakes: integer('extra_retakes').notNull().default(0),
    retakesUsed: integer('retakes_used').notNull().default(0),
    countedScore10: doublePrecision('counted_score10'),
    countedAttemptNo: integer('counted_attempt_no'),
    retakeRequestedAt: timestamp('retake_requested_at', { withTimezone: true }),
    retakeRequestNote: text('retake_request_note'),
    retakeApprovedAt: timestamp('retake_approved_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    firstIp: varchar('first_ip', { length: 64 }),
    firstUaHash: varchar('first_ua_hash', { length: 32 }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.userId] }) }),
);

export const vecAttempts = pgTable(
  'vec_attempts',
  {
    id: id(),
    sessionId: text('session_id')
      .notNull()
      .references(() => vecSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attemptNo: integer('attempt_no').notNull().default(1),
    countsTowardLimit: boolean('counts_toward_limit').notNull().default(true),
    state: varchar('state', { length: 16 }).notNull().default('LOBBY'),
    /** Optimistic lock for lecturer actions. */
    version: integer('version').notNull().default(0),
    paperCode: varchar('paper_code', { length: 6 }).notNull(),
    seed: text('seed').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    pausedBaseSec: integer('paused_base_sec').notNull().default(0),
    timeBonusSec: integer('time_bonus_sec').notNull().default(0),
    submitReason: varchar('submit_reason', { length: 16 }),
    lockReason: text('lock_reason'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    answeredCount: integer('answered_count').notNull().default(0),
    flaggedCount: integer('flagged_count').notNull().default(0),
    currentIndex: integer('current_index').notNull().default(0),
    correctCount: integer('correct_count'),
    wrongCount: integer('wrong_count'),
    blankCount: integer('blank_count'),
    score10: doublePrecision('score10'),
    gradeLabel: varchar('grade_label', { length: 16 }),
    passed: boolean('passed'),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
    violationLock: integer('violation_lock').notNull().default(0),
    violationWarn: integer('violation_warn').notNull().default(0),
    violationLog: integer('violation_log').notNull().default(0),
    riskScore: integer('risk_score').notNull().default(0),
    ipAtStart: varchar('ip_at_start', { length: 64 }),
    uaHash: varchar('ua_hash', { length: 32 }),
    /** One exam connection per attempt: a second tab or device is refused. */
    connectionId: text('connection_id'),
    connectionAt: timestamp('connection_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    fullscreen: boolean('fullscreen'),
    visible: boolean('visible'),
    focused: boolean('focused'),
    lastIp: varchar('last_ip', { length: 64 }),
    /** PE: the lecturer's note to the candidate, who graded, and when the candidate closed the room. */
    gradeNote: text('grade_note'),
    gradedBy: text('graded_by').references(() => users.id, { onDelete: 'set null' }),
    peClosedAt: timestamp('pe_closed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // One live attempt per account, even under a race (CAN-R1).
    oneActive: uniqueIndex('vec_one_active_attempt_per_user')
      .on(t.userId)
      .where(sql`${t.state} IN ('LOBBY', 'IN_PROGRESS', 'SUSPENDED')`),
    attemptNo: uniqueIndex('vec_attempt_no_idx').on(t.sessionId, t.userId, t.attemptNo),
    sessionState: index('vec_attempts_session_state_idx').on(t.sessionId, t.state),
  }),
);

export const vecAttemptAnswers = pgTable(
  'vec_attempt_answers',
  {
    attemptId: text('attempt_id')
      .notNull()
      .references(() => vecAttempts.id, { onDelete: 'cascade' }),
    qid: varchar('qid', { length: 24 }).notNull(),
    /** Indexes into the original options, translated from the opaque ids. */
    selected: jsonb('selected').$type<number[]>().notNull(),
    flagged: boolean('flagged').notNull().default(false),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
    lateSync: boolean('late_sync').notNull().default(false),
  },
  (t) => ({ pk: primaryKey({ columns: [t.attemptId, t.qid] }) }),
);

export const vecAttemptEvents = pgTable(
  'vec_attempt_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => vecAttempts.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => vecSessions.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 32 }).notNull(),
    severity: varchar('severity', { length: 8 }).notNull().default('INFO'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    actorId: text('actor_id'),
    createdAt: createdAt(),
  },
  (t) => ({
    sessionIdx: index('vec_events_session_id_idx').on(t.sessionId, t.id),
    attemptIdx: index('vec_events_attempt_idx').on(t.attemptId, t.id),
  }),
);

export const vecUnlockRequests = pgTable(
  'vec_unlock_requests',
  {
    id: id(),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => vecAttempts.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => vecSessions.id, { onDelete: 'cascade' }),
    /** UNLOCK | RETAKE */
    kind: varchar('kind', { length: 8 }).notNull().default('UNLOCK'),
    reason: text('reason').notNull().default(''),
    /** PENDING | APPROVED | DENIED | REDO */
    status: varchar('status', { length: 8 }).notNull().default('PENDING'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ sessionIdx: index('vec_unlock_session_idx').on(t.sessionId, t.status) }),
);

export const vecMessages = pgTable(
  'vec_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => vecSessions.id, { onDelete: 'cascade' }),
    /** null = the whole room */
    attemptId: text('attempt_id').references(() => vecAttempts.id, { onDelete: 'cascade' }),
    senderId: text('sender_id'),
    kind: varchar('kind', { length: 8 }).notNull().default('ANNOUNCE'),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ sessionIdx: index('vec_messages_session_idx').on(t.sessionId, t.id) }),
);

/** Lecturer and admin actions. Survives a session delete only as an anonymous tombstone. */
export const vecAudit = pgTable(
  'vec_audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionId: text('session_id'),
    actorId: text('actor_id'),
    action: varchar('action', { length: 40 }).notNull(),
    target: text('target'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => ({ sessionIdx: index('vec_audit_session_idx').on(t.sessionId, t.id) }),
);

/** Wrong room codes and OTPs, to slow down guessing. Kept 24 hours. */
export const vecJoinAttempts = pgTable(
  'vec_join_attempts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id').notNull(),
    ip: varchar('ip', { length: 64 }),
    kind: varchar('kind', { length: 4 }).notNull(),
    key: varchar('key', { length: 40 }),
    ok: boolean('ok').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ userIdx: index('vec_join_attempts_user_idx').on(t.userId, t.createdAt) }),
);

/**
 * Every stored file of a PE room: paper and materials the lecturer uploaded, and the
 * candidates' solutions. A row without a session (a draft, or a room that is gone)
 * has its stored file removed by the scheduler after a day.
 */
export const vecFiles = pgTable(
  'vec_files',
  {
    id: id(),
    sessionId: text('session_id').references(() => vecSessions.id, { onDelete: 'set null' }),
    attemptId: text('attempt_id').references(() => vecAttempts.id, { onDelete: 'set null' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** PAPER | MATERIAL | SUBMISSION */
    role: varchar('role', { length: 12 }).notNull(),
    name: text('name').notNull(),
    format: varchar('format', { length: 12 }).notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }),
    /** CLOUDINARY | DISK */
    storage: varchar('storage', { length: 12 }).notNull(),
    storageKey: text('storage_key').notNull(),
    /** PENDING | READY */
    status: varchar('status', { length: 10 }).notNull().default('PENDING'),
    createdAt: createdAt(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
  },
  (t) => ({ sessionIdx: index('vec_files_session_idx').on(t.sessionId) }),
);

export const vecSubmissions = pgTable(
  'vec_submissions',
  {
    id: id(),
    sessionId: text('session_id')
      .notNull()
      .references(() => vecSessions.id, { onDelete: 'cascade' }),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => vecAttempts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    no: integer('no').notNull(),
    fileId: text('file_id').references(() => vecFiles.id, { onDelete: 'set null' }),
    path: text('path').notNull(),
    fileName: text('file_name').notNull(),
    fileCount: integer('file_count').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    note: text('note'),
    late: boolean('late').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => ({
    noIdx: uniqueIndex('vec_submissions_no_idx').on(t.attemptId, t.no),
    sessionIdx: index('vec_submissions_session_idx').on(t.sessionId),
  }),
);

export type VecFileRow = typeof vecFiles.$inferSelect;
export type VecSessionRow = typeof vecSessions.$inferSelect;
export type VecAttemptRow = typeof vecAttempts.$inferSelect;
export type VecParticipantRow = typeof vecParticipants.$inferSelect;
export type VecQuestionRow = typeof vecSessionQuestions.$inferSelect;
