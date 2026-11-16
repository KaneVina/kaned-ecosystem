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
import type { Requirement } from '@kaned/shared';
import {
  type AnyPgColumn,
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
/** LINK: the document is a URL (Google Slides, Canva, YouTube…) instead of an uploaded file. */
export const fileFormatEnum = pgEnum('file_format', ['PDF', 'DOCX', 'PPTX', 'XLSX', 'HTML', 'MD', 'LINK']);
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

    year: integer('year').notNull(),
    semester: semesterEnum('semester').notNull(),
    schoolYear: varchar('school_year', { length: 20 }),
    lecturer: varchar('lecturer', { length: 120 }),
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.subjectId] }),
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
