import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  DOCUMENT_STATUSES,
  isExternalFormat,
  isWebUrl,
  parseGithubUrl,
  type AdminDocumentDto,
  type AdminDocumentQuery,
  type AdminDocumentUpdate,
  type CreateDocumentInput,
  type DocumentBulkInput,
  type DocumentStatus,
  type Paginated,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { documents, subjects, users } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { documentWith, toDocumentSummary } from '../../lib/dto.js';
import { logActivity, type ActivityAction } from '../../lib/activity.js';
import { storage } from '../../lib/storage.js';
import { foldVietnamese } from '../../lib/slug.js';
import * as library from '../documents/documents.service.js';
import { notFound } from './util.js';

type Row = NonNullable<Awaited<ReturnType<typeof findOne>>>;

const findOne = (id: string) => db.query.documents.findFirst({ where: eq(documents.id, id), with: documentWith });

export function toAdminDocument(row: Row): AdminDocumentDto {
  return { ...toDocumentSummary(row), fileUrl: storage.deliveryUrl(row), updatedAt: row.updatedAt.toISOString() };
}

function filtersFor(query: Omit<AdminDocumentQuery, 'status' | 'page' | 'pageSize' | 'sort'>): SQL[] {
  const filters: SQL[] = [];
  if (query.universityId) filters.push(eq(documents.universityId, query.universityId));
  if (query.subjectId) filters.push(eq(documents.subjectId, query.subjectId));
  if (query.type) filters.push(eq(documents.type, query.type));
  if (query.format) filters.push(eq(documents.format, query.format));
  if (query.folderId === 'none') filters.push(isNull(documents.folderId));
  else if (query.folderId) filters.push(eq(documents.folderId, query.folderId));
  if (query.q) {
    const q = `%${query.q.trim()}%`;
    const folded = `%${foldVietnamese(query.q)}%`;
    const match = or(
      ilike(documents.title, q),
      ilike(documents.title, folded),
      sql`exists (select 1 from ${subjects} s where s.id = ${documents.subjectId} and (s.code ilike ${q} or s.name_vi ilike ${q}))`,
      sql`exists (select 1 from ${users} u where u.id = ${documents.uploaderId} and (u.name ilike ${q} or u.email ilike ${q}))`,
    );
    if (match) filters.push(match);
  }
  return filters;
}

export async function listDocuments(
  query: AdminDocumentQuery,
): Promise<Paginated<AdminDocumentDto> & { statusCounts: Record<DocumentStatus, number> }> {
  const base = filtersFor(query);
  const where = and(...base, ...(query.status ? [eq(documents.status, query.status)] : []));
  const orderBy =
    query.sort === 'downloads'
      ? [desc(documents.downloads), desc(documents.createdAt)]
      : query.sort === 'title'
        ? [asc(documents.title)]
        : [desc(documents.createdAt)];

  const [[total], rows, byStatus] = await Promise.all([
    db.select({ value: count() }).from(documents).where(where),
    db.query.documents.findMany({
      where,
      with: documentWith,
      orderBy,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
    db
      .select({ status: documents.status, value: count() })
      .from(documents)
      .where(base.length ? and(...base) : undefined)
      .groupBy(documents.status),
  ]);

  const statusCounts = Object.fromEntries(DOCUMENT_STATUSES.map((s) => [s, 0])) as Record<DocumentStatus, number>;
  for (const r of byStatus) statusCounts[r.status] = r.value;

  return {
    items: rows.map(toAdminDocument),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.value ?? 0,
    totalPages: Math.max(1, Math.ceil((total?.value ?? 0) / query.pageSize)),
    statusCounts,
  };
}

export async function getDocument(id: string) {
  const row = await findOne(id);
  if (!row) notFound('tài liệu');
  return toAdminDocument(row);
}

export async function createDocument(
  actorId: string,
  input: CreateDocumentInput & { status?: DocumentStatus },
) {
  const { status, ...rest } = input;
  const created = await library.createDocument(actorId, rest, { status: status ?? 'PUBLISHED' });
  await logActivity(
    actorId,
    'create',
    'document',
    created.id,
    `Đăng ${input.format === 'LINK' ? 'liên kết' : input.format === 'GITHUB' ? 'tài liệu GitHub' : 'tài liệu'} “${input.title}” (${created.subject.code})`,
  );
  return getDocument(created.id);
}

const STATUS_ACTION: Record<DocumentStatus, ActivityAction> = {
  PUBLISHED: 'publish',
  REJECTED: 'reject',
  REMOVED: 'remove',
  PENDING: 'update',
};

export async function updateDocument(actorId: string, role: string, id: string, input: AdminDocumentUpdate) {
  const before = await findOne(id);
  if (!before) notFound('tài liệu');
  const { status, linkUrl, ...meta } = input;

  if (Object.keys(meta).length) await library.updateDocument(id, actorId, role, meta);

  if (linkUrl !== undefined) {
    if (!isExternalFormat(before.format)) throw ApiError.badRequest('Chỉ tài liệu dạng liên kết mới đổi được địa chỉ.');
    if (!isWebUrl(linkUrl)) throw ApiError.badRequest('Liên kết không hợp lệ.', { linkUrl: 'Bắt đầu bằng https://' });
    if (before.format === 'GITHUB' && !parseGithubUrl(linkUrl)) {
      throw ApiError.badRequest('Đây không phải liên kết GitHub.', { linkUrl: 'Dán liên kết https://github.com/…' });
    }
    await db.update(documents).set({ fileUrl: linkUrl }).where(eq(documents.id, id));
  }
  if (status && status !== before.status) {
    await db.update(documents).set({ status }).where(eq(documents.id, id));
  }

  const statusChanged = status && status !== before.status;
  await logActivity(
    actorId,
    statusChanged ? STATUS_ACTION[status] : 'update',
    'document',
    id,
    statusChanged
      ? `${{ PUBLISHED: 'Duyệt đăng', REJECTED: 'Từ chối', REMOVED: 'Gỡ', PENDING: 'Chuyển về chờ duyệt' }[status]} “${before.title}”`
      : `Sửa tài liệu “${meta.title ?? before.title}”`,
  );
  return getDocument(id);
}

export async function deleteDocument(actorId: string, id: string) {
  const row = await findOne(id);
  if (!row) notFound('tài liệu');
  await db.delete(documents).where(eq(documents.id, id));
  if (!isExternalFormat(row.format) && row.filePublicId) await storage.destroy(row.filePublicId).catch(() => undefined);
  await logActivity(actorId, 'delete', 'document', id, `Xoá tài liệu “${row.title}”`);
}

export async function bulk(actorId: string, input: DocumentBulkInput) {
  const rows = await db
    .select({ id: documents.id, title: documents.title, format: documents.format, filePublicId: documents.filePublicId })
    .from(documents)
    .where(inArray(documents.id, input.ids));
  if (!rows.length) return { affected: 0 };
  const ids = rows.map((r) => r.id);

  if (input.action === 'delete') {
    await db.delete(documents).where(inArray(documents.id, ids));
    await Promise.all(
      rows.filter((r) => !isExternalFormat(r.format) && r.filePublicId).map((r) => storage.destroy(r.filePublicId).catch(() => undefined)),
    );
  } else {
    const status: DocumentStatus = { publish: 'PUBLISHED', reject: 'REJECTED', remove: 'REMOVED' }[input.action] as DocumentStatus;
    await db.update(documents).set({ status }).where(inArray(documents.id, ids));
  }

  const verb = { publish: 'Duyệt đăng', reject: 'Từ chối', remove: 'Gỡ', delete: 'Xoá' }[input.action];
  await logActivity(
    actorId,
    input.action === 'delete' ? 'delete' : STATUS_ACTION[({ publish: 'PUBLISHED', reject: 'REJECTED', remove: 'REMOVED' } as const)[input.action]],
    'document',
    null,
    `${verb} ${rows.length} tài liệu${rows.length <= 3 ? `: ${rows.map((r) => `“${r.title}”`).join(', ')}` : ''}`,
  );
  return { affected: rows.length };
}
