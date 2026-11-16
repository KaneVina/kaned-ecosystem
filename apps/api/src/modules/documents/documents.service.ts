import { and, count, desc, eq, gte, ilike, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import type {
  CreateDocumentInput,
  DocumentDetailDto,
  DocumentQuery,
  DocumentSummaryDto,
  Paginated,
  ReviewInput,
  UpdateDocumentInput,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import {
  academicTerms,
  bookmarks,
  subjectFolders,
  documentTags,
  documents,
  majorSubjects,
  reviews,
  subjects,
  tags,
} from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { storage } from '../../lib/storage.js';
import { foldVietnamese, slugify } from '../../lib/slug.js';
import { isWebUrl } from '@kaned/shared';
import { documentWith, toDocumentSummary, toReview, userWith } from '../../lib/dto.js';

function buildFilters(query: DocumentQuery): SQL[] {
  const filters: SQL[] = [eq(documents.status, 'PUBLISHED')];

  if (query.universityId?.length) filters.push(inArray(documents.universityId, query.universityId));
  if (query.subjectId?.length) filters.push(inArray(documents.subjectId, query.subjectId));
  if (query.type?.length) {
    filters.push(inArray(documents.type, query.type as DocumentSummaryDto['type'][]));
  }
  if (query.format?.length) {
    filters.push(inArray(documents.format, query.format as DocumentSummaryDto['format'][]));
  }
  if (query.year?.length) filters.push(inArray(documents.year, query.year));
  if (query.semester?.length) {
    filters.push(inArray(documents.semester, query.semester as DocumentSummaryDto['semester'][]));
  }
  if (query.minRating) filters.push(gte(documents.ratingAvg, query.minRating));
  if (query.uploaderId) filters.push(eq(documents.uploaderId, query.uploaderId));
  if (query.folderId === 'none') filters.push(isNull(documents.folderId));
  else if (query.folderId) filters.push(eq(documents.folderId, query.folderId));

  if (query.facultyId) {
    filters.push(
      sql`exists (select 1 from ${subjects} s where s.id = ${documents.subjectId} and s.faculty_id = ${query.facultyId})`,
    );
  }
  if (query.majorId) {
    filters.push(
      sql`exists (select 1 from ${majorSubjects} ms where ms.subject_id = ${documents.subjectId} and ms.major_id = ${query.majorId})`,
    );
  }
  if (query.bookmarkedBy) {
    filters.push(
      sql`exists (select 1 from ${bookmarks} b where b.document_id = ${documents.id} and b.user_id = ${query.bookmarkedBy})`,
    );
  }

  if (query.q) {
    const q = `%${query.q.trim()}%`;
    const folded = `%${foldVietnamese(query.q)}%`;
    const match = or(
      ilike(documents.title, q),
      ilike(documents.title, folded),
      ilike(documents.description, q),
      sql`exists (select 1 from ${subjects} s where s.id = ${documents.subjectId} and (s.code ilike ${folded} or s.name ilike ${q} or s.name_vi ilike ${q}))`,
      sql`exists (select 1 from ${documentTags} dt join ${tags} t on t.id = dt.tag_id where dt.document_id = ${documents.id} and t.name ilike ${q})`,
    );
    if (match) filters.push(match);
  }

  return filters;
}

function buildOrder(sort: DocumentQuery['sort']) {
  switch (sort) {
    case 'views':
      return [desc(documents.views), desc(documents.createdAt)];
    case 'recent':
      return [desc(documents.createdAt)];
    case 'rating':
      return [desc(documents.ratingAvg), desc(documents.ratingCount)];
    case 'relevance':
      // Without a full-text index, popularity is the most useful proxy.
      return [desc(documents.downloads), desc(documents.ratingAvg)];
    case 'downloads':
    default:
      return [desc(documents.downloads), desc(documents.createdAt)];
  }
}

async function bookmarkSet(viewerId: string | undefined, documentIds: string[]) {
  if (!viewerId || !documentIds.length) return new Set<string>();
  const rows = await db
    .select({ documentId: bookmarks.documentId })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, viewerId), inArray(bookmarks.documentId, documentIds)));
  return new Set(rows.map((r) => r.documentId));
}

export async function listDocuments(
  query: DocumentQuery,
  viewerId?: string,
): Promise<Paginated<DocumentSummaryDto>> {
  const where = and(...buildFilters(query));

  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(documents).where(where),
    db.query.documents.findMany({
      where,
      with: documentWith,
      orderBy: buildOrder(query.sort),
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  ]);

  const bookmarked = await bookmarkSet(viewerId, rows.map((r) => r.id));

  return {
    items: rows.map((row) => toDocumentSummary(row, { isBookmarked: bookmarked.has(row.id) })),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.value ?? 0,
    totalPages: Math.max(1, Math.ceil((total?.value ?? 0) / query.pageSize)),
  };
}

/** Facet counts so the filter panel can show how many results each option has. */
export async function documentFacets(query: DocumentQuery) {
  const where = and(...buildFilters(query));

  const [byType, byFormat, byUniversity, bySubject] = await Promise.all([
    db.select({ key: documents.type, value: count() }).from(documents).where(where).groupBy(documents.type),
    db
      .select({ key: documents.format, value: count() })
      .from(documents)
      .where(where)
      .groupBy(documents.format),
    db
      .select({ key: documents.universityId, value: count() })
      .from(documents)
      .where(where)
      .groupBy(documents.universityId),
    db
      .select({ key: documents.subjectId, value: count() })
      .from(documents)
      .where(where)
      .groupBy(documents.subjectId),
  ]);

  const toMap = (rows: Array<{ key: string; value: number }>) =>
    Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    type: toMap(byType),
    format: toMap(byFormat),
    universityId: toMap(byUniversity),
    subjectId: toMap(bySubject),
  };
}

export async function getDocument(id: string, viewerId?: string): Promise<DocumentDetailDto> {
  const row = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: documentWith,
  });
  if (!row || row.status === 'REMOVED') throw ApiError.notFound('That document is no longer here.');

  // Fire and forget: counting a view must never slow the response down.
  void db
    .update(documents)
    .set({ views: sql`${documents.views} + 1` })
    .where(eq(documents.id, id))
    .catch(() => undefined);

  const [reviewRows, related, moreFromUploader, bookmarked] = await Promise.all([
    db.query.reviews.findMany({
      where: eq(reviews.documentId, id),
      with: { user: { with: userWith } },
      orderBy: desc(reviews.createdAt),
      limit: 20,
    }),
    db.query.documents.findMany({
      where: and(
        eq(documents.status, 'PUBLISHED'),
        ne(documents.id, id),
        or(eq(documents.subjectId, row.subjectId), eq(documents.type, row.type)),
      ),
      with: documentWith,
      orderBy: desc(documents.downloads),
      limit: 4,
    }),
    db.query.documents.findMany({
      where: and(
        eq(documents.status, 'PUBLISHED'),
        eq(documents.uploaderId, row.uploaderId),
        ne(documents.id, id),
      ),
      with: documentWith,
      orderBy: desc(documents.createdAt),
      limit: 4,
    }),
    bookmarkSet(viewerId, [id]),
  ]);

  return {
    ...toDocumentSummary(row, { isBookmarked: bookmarked.has(id) }),
    views: row.views + 1,
    fileUrl: row.fileUrl,
    reviews: reviewRows.map(toReview),
    related: related.map((d) => toDocumentSummary(d)),
    moreFromUploader: moreFromUploader.map((d) => toDocumentSummary(d)),
  };
}

async function tagIdsFor(names: string[]): Promise<string[]> {
  const unique = [...new Set(names.map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  const ids: string[] = [];

  for (const name of unique) {
    const slug = slugify(name);
    if (!slug) continue;
    const [row] = await db
      .insert(tags)
      .values({ name, slug })
      .onConflictDoUpdate({ target: tags.slug, set: { name } })
      .returning({ id: tags.id });
    ids.push(row.id);
  }
  return ids;
}

/**
 * A file needs the storage id and size from the upload; a link needs an
 * http(s) address and has neither.
 */
function assertSource(input: Pick<CreateDocumentInput, 'format' | 'fileUrl' | 'filePublicId' | 'fileBytes'>) {
  if (input.format === 'LINK') {
    if (!isWebUrl(input.fileUrl)) {
      throw ApiError.badRequest('Liên kết phải bắt đầu bằng http:// hoặc https://', { fileUrl: 'Liên kết không hợp lệ.' });
    }
    return;
  }
  if (!input.filePublicId || input.fileBytes < 1) {
    throw ApiError.badRequest('Tệp chưa tải lên xong.', { fileUrl: 'Tải tệp lên trước khi đăng.' });
  }
}

/** A folder must belong to the document's subject. */
export async function assertFolder(folderId: string | null | undefined, subjectId: string) {
  if (!folderId) return null;
  const folder = await db.query.subjectFolders.findFirst({ where: eq(subjectFolders.id, folderId) });
  if (!folder || folder.subjectId !== subjectId) {
    throw ApiError.badRequest('Thư mục không thuộc môn này.', { folderId: 'Chọn thư mục của môn này.' });
  }
  return folder.id;
}

/** The university's term, if one was picked, decides semester and school year. */
async function termFields(academicTermId: string | null | undefined, universityId: string) {
  if (!academicTermId) return {};
  const term = await db.query.academicTerms.findFirst({ where: eq(academicTerms.id, academicTermId) });
  if (!term || term.universityId !== universityId) {
    throw ApiError.badRequest('Kỳ học không thuộc trường của môn này.', { academicTermId: 'Chọn lại kỳ học.' });
  }
  return { academicTermId: term.id, semester: term.semester, schoolYear: term.schoolYear };
}

export async function createDocument(
  uploaderId: string,
  input: CreateDocumentInput,
  options: { status?: DocumentSummaryDto['status'] } = {},
) {
  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, input.subjectId) });
  if (!subject) {
    throw ApiError.badRequest('That subject does not exist.', { subjectId: 'Unknown subject.' });
  }
  assertSource(input);
  const term = await termFields(input.academicTermId, subject.universityId);
  const folderId = await assertFolder(input.folderId, subject.id);
  const isLink = input.format === 'LINK';

  const [created] = await db
    .insert(documents)
    .values({
      title: input.title,
      description: input.description,
      type: input.type,
      format: input.format,
      language: input.language,
      fileUrl: input.fileUrl,
      filePublicId: isLink ? '' : input.filePublicId,
      fileBytes: isLink ? 0 : input.fileBytes,
      pages: input.pages ?? null,
      thumbnailUrl: input.thumbnailUrl ?? (isLink ? null : storage.thumbnailFor(input.filePublicId, input.format)),
      year: input.year,
      semester: input.semester,
      schoolYear: input.schoolYear ?? null,
      lecturer: input.lecturer?.trim() || null,
      period: input.period?.trim() || null,
      ...term,
      folderId,
      status: options.status ?? 'PUBLISHED',
      universityId: subject.universityId,
      subjectId: input.subjectId,
      uploaderId,
    })
    .returning({ id: documents.id });

  const tagIds = await tagIdsFor(input.tags);
  if (tagIds.length) {
    await db
      .insert(documentTags)
      .values(tagIds.map((tagId) => ({ documentId: created.id, tagId })))
      .onConflictDoNothing();
  }

  const row = await db.query.documents.findFirst({
    where: eq(documents.id, created.id),
    with: documentWith,
  });
  return toDocumentSummary(row!);
}

async function assertCanEdit(documentId: string, userId: string, role: string) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) throw ApiError.notFound('That document is no longer here.');
  if (doc.uploaderId !== userId && role !== 'ADMIN' && role !== 'MODERATOR') {
    throw ApiError.forbidden('You can only change documents you uploaded.');
  }
  return doc;
}

export async function updateDocument(
  id: string,
  userId: string,
  role: string,
  input: UpdateDocumentInput,
) {
  const doc = await assertCanEdit(id, userId, role);
  const term =
    input.academicTermId !== undefined
      ? input.academicTermId
        ? await termFields(input.academicTermId, input.universityId ?? doc.universityId)
        : { academicTermId: null }
      : {};

  const subjectId = input.subjectId ?? doc.subjectId;
  // Moving to another subject leaves the old subject's folder behind.
  const folder =
    input.folderId !== undefined
      ? { folderId: await assertFolder(input.folderId, subjectId) }
      : input.subjectId && input.subjectId !== doc.subjectId
        ? { folderId: null }
        : {};

  await db
    .update(documents)
    .set({
      title: input.title,
      description: input.description,
      type: input.type,
      year: input.year,
      semester: input.semester,
      schoolYear: input.schoolYear,
      ...(input.lecturer !== undefined ? { lecturer: input.lecturer?.trim() || null } : {}),
      ...(input.period !== undefined ? { period: input.period?.trim() || null } : {}),
      language: input.language,
      subjectId: input.subjectId,
      universityId: input.universityId,
      ...term,
      ...folder,
    })
    .where(eq(documents.id, id));

  if (input.tags) {
    await db.delete(documentTags).where(eq(documentTags.documentId, id));
    const tagIds = await tagIdsFor(input.tags);
    if (tagIds.length) {
      await db.insert(documentTags).values(tagIds.map((tagId) => ({ documentId: id, tagId })));
    }
  }

  const row = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: documentWith,
  });
  return toDocumentSummary(row!);
}

export async function deleteDocument(id: string, userId: string, role: string) {
  const doc = await assertCanEdit(id, userId, role);
  await db.delete(documents).where(eq(documents.id, id));
  if (doc.format !== 'LINK' && doc.filePublicId) await storage.destroy(doc.filePublicId);
}

/** Counts the download and hands back the file URL. */
export async function registerDownload(id: string) {
  const [row] = await db
    .update(documents)
    .set({ downloads: sql`${documents.downloads} + 1` })
    .where(eq(documents.id, id))
    .returning({
      fileUrl: documents.fileUrl,
      title: documents.title,
      format: documents.format,
      downloads: documents.downloads,
    });

  if (!row) throw ApiError.notFound('That document is no longer here.');
  return row;
}

export async function toggleBookmark(documentId: string, userId: string) {
  const existing = await db.query.bookmarks.findFirst({
    where: and(eq(bookmarks.userId, userId), eq(bookmarks.documentId, documentId)),
  });

  if (existing) {
    await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.documentId, documentId)));
    return { bookmarked: false };
  }

  await db.insert(bookmarks).values({ userId, documentId }).onConflictDoNothing();
  return { bookmarked: true };
}

export async function upsertReview(documentId: string, userId: string, input: ReviewInput) {
  const document = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!document) throw ApiError.notFound('That document is no longer here.');
  if (document.uploaderId === userId) throw ApiError.badRequest('You cannot review your own upload.');

  await db
    .insert(reviews)
    .values({ userId, documentId, score: input.score, comment: input.comment })
    .onConflictDoUpdate({
      target: [reviews.userId, reviews.documentId],
      set: { score: input.score, comment: input.comment, updatedAt: new Date() },
    });

  // Keep the denormalised rating on the document in step with the reviews.
  const [aggregate] = await db
    .select({
      avg: sql<number>`coalesce(avg(${reviews.score}), 0)::float8`,
      total: count(),
    })
    .from(reviews)
    .where(eq(reviews.documentId, documentId));

  await db
    .update(documents)
    .set({ ratingAvg: aggregate?.avg ?? 0, ratingCount: aggregate?.total ?? 0 })
    .where(eq(documents.id, documentId));

  const review = await db.query.reviews.findFirst({
    where: and(eq(reviews.userId, userId), eq(reviews.documentId, documentId)),
    with: { user: { with: userWith } },
  });

  return toReview(review!);
}

/** Documents the signed-in user saved, used by the "Saved" page. */
export async function listBookmarked(userId: string) {
  const rows = await db.query.bookmarks.findMany({
    where: eq(bookmarks.userId, userId),
    orderBy: desc(bookmarks.createdAt),
    with: { document: { with: documentWith } },
  });

  return rows
    .filter((r) => r.document)
    .map((r) => toDocumentSummary(r.document, { isBookmarked: true }));
}
