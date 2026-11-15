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
import {
  boolean,
  doublePrecision,
  index,
  integer,
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
]);
export const fileFormatEnum = pgEnum('file_format', ['PDF', 'DOCX', 'PPTX', 'XLSX']);
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
    facultyId: text('faculty_id')
      .notNull()
      .references(() => faculties.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqueCode: uniqueIndex('majors_faculty_code_idx').on(t.facultyId, t.code),
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
    googleId: varchar('google_id', { length: 64 }).unique(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    role: roleEnum('role').notNull().default('STUDENT'),
    year: integer('year'),
    universityId: text('university_id').references(() => universities.id, { onDelete: 'set null' }),
    majorId: text('major_id').references(() => majors.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    universityIdx: index('users_university_idx').on(t.universityId),
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

/* ─────────────────────────────── relations ──────────────────────────── */

export const universityRelations = relations(universities, ({ many }) => ({
  faculties: many(faculties),
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
}));

export const documentRelations = relations(documents, ({ one, many }) => ({
  university: one(universities, {
    fields: [documents.universityId],
    references: [universities.id],
  }),
  subject: one(subjects, { fields: [documents.subjectId], references: [subjects.id] }),
  uploader: one(users, { fields: [documents.uploaderId], references: [users.id] }),
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
export type DocumentRow = typeof documents.$inferSelect;
export type SubjectRow = typeof subjects.$inferSelect;
export type UniversityRow = typeof universities.$inferSelect;
export type MajorRow = typeof majors.$inferSelect;
export type GradeRow = typeof grades.$inferSelect;
