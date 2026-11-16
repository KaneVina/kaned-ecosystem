import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { MAX_FOLDER_DEPTH, type FolderDto, type FolderInput, type FolderUpdate, type MoveDocumentsInput } from '@kaned/shared';
import { db } from '../../db/index.js';
import { documents, subjectFolders, subjects, type SubjectFolderRow } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { logActivity } from '../../lib/activity.js';
import { notFound } from './util.js';

/**
 * Folders of a subject, flat and ordered (position, then name with numbers
 * read as numbers, so "Đề 2" comes before "Đề 10"). Counts are direct
 * children only; onlyPublished counts what students can see.
 */
export async function listFolders(subjectId: string, onlyPublished = false): Promise<FolderDto[]> {
  const rows = await db.query.subjectFolders.findMany({
    where: eq(subjectFolders.subjectId, subjectId),
    orderBy: [asc(subjectFolders.position), asc(subjectFolders.name)],
  });
  if (!rows.length) return [];
  const counts = await db
    .select({ folderId: documents.folderId, value: count() })
    .from(documents)
    .where(
      and(
        inArray(documents.folderId, rows.map((r) => r.id)),
        ...(onlyPublished ? [eq(documents.status, 'PUBLISHED')] : []),
      ),
    )
    .groupBy(documents.folderId);
  const by = new Map(counts.map((c) => [c.folderId, c.value]));
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
  return rows
    .sort((a, b) => a.position - b.position || collator.compare(a.name, b.name))
    .map((r) => ({ id: r.id, subjectId: r.subjectId, parentId: r.parentId, name: r.name, position: r.position, documentCount: by.get(r.id) ?? 0 }));
}

async function folderById(id: string) {
  const row = await db.query.subjectFolders.findFirst({ where: eq(subjectFolders.id, id) });
  if (!row) notFound('thư mục');
  return row;
}

/** How deep a folder sits: a top-level folder is 1. */
async function depthOf(folder: SubjectFolderRow | null): Promise<number> {
  let depth = 0;
  let current = folder;
  while (current) {
    depth += 1;
    current = current.parentId ? ((await db.query.subjectFolders.findFirst({ where: eq(subjectFolders.id, current.parentId) })) ?? null) : null;
    if (depth > 20) break;
  }
  return depth;
}

/** Levels below a folder, counting the folder itself as 1. */
async function heightOf(folderId: string): Promise<number> {
  const children = await db.select({ id: subjectFolders.id }).from(subjectFolders).where(eq(subjectFolders.parentId, folderId));
  let max = 0;
  for (const c of children) max = Math.max(max, await heightOf(c.id));
  return max + 1;
}

async function assertUniqueName(subjectId: string, parentId: string | null, name: string, exceptId?: string) {
  const siblings = await db
    .select({ id: subjectFolders.id, name: subjectFolders.name })
    .from(subjectFolders)
    .where(and(eq(subjectFolders.subjectId, subjectId), parentId ? eq(subjectFolders.parentId, parentId) : isNull(subjectFolders.parentId)));
  if (siblings.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    throw ApiError.conflict(`Đã có thư mục “${name}” ở đây.`, { name: 'Tên này đã có ở cùng cấp.' });
  }
}

export async function createFolder(actorId: string, input: FolderInput) {
  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, input.subjectId) });
  if (!subject) throw ApiError.badRequest('Môn học không tồn tại.');
  const parent = input.parentId ? await folderById(input.parentId) : null;
  if (parent && parent.subjectId !== subject.id) throw ApiError.badRequest('Thư mục cha thuộc môn khác.');
  if ((await depthOf(parent)) + 1 > MAX_FOLDER_DEPTH) {
    throw ApiError.badRequest(`Thư mục lồng tối đa ${MAX_FOLDER_DEPTH} cấp.`, { parentId: `Tối đa ${MAX_FOLDER_DEPTH} cấp.` });
  }
  await assertUniqueName(subject.id, parent?.id ?? null, input.name);
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${subjectFolders.position}) + 1, 0)::int` })
    .from(subjectFolders)
    .where(and(eq(subjectFolders.subjectId, subject.id), parent ? eq(subjectFolders.parentId, parent.id) : isNull(subjectFolders.parentId)));
  const [row] = await db
    .insert(subjectFolders)
    .values({ subjectId: subject.id, parentId: parent?.id ?? null, name: input.name, position: next })
    .returning();
  await logActivity(actorId, 'create', 'folder', row.id, `Tạo thư mục “${input.name}” trong ${subject.code}${parent ? ` / ${parent.name}` : ''}`);
  return (await listFolders(subject.id)).find((f) => f.id === row.id)!;
}

export async function updateFolder(actorId: string, id: string, input: FolderUpdate) {
  const folder = await folderById(id);
  const patch: Partial<SubjectFolderRow> = {};

  if (input.parentId !== undefined && input.parentId !== folder.parentId) {
    const parent = input.parentId ? await folderById(input.parentId) : null;
    if (parent && parent.subjectId !== folder.subjectId) throw ApiError.badRequest('Thư mục đích thuộc môn khác.');
    // A folder cannot move into itself or one of its own subfolders.
    for (let cur = parent; cur; cur = cur.parentId ? await folderById(cur.parentId) : null) {
      if (cur.id === folder.id) throw ApiError.badRequest('Không thể chuyển thư mục vào chính nó.');
    }
    if ((await depthOf(parent)) + (await heightOf(folder.id)) > MAX_FOLDER_DEPTH) {
      throw ApiError.badRequest(`Thư mục lồng tối đa ${MAX_FOLDER_DEPTH} cấp.`);
    }
    patch.parentId = parent?.id ?? null;
  }
  if (input.name !== undefined) patch.name = input.name;
  if (input.position !== undefined) patch.position = input.position;
  if (patch.name !== undefined || patch.parentId !== undefined) {
    await assertUniqueName(folder.subjectId, patch.parentId !== undefined ? patch.parentId : folder.parentId, patch.name ?? folder.name, folder.id);
  }

  await db.update(subjectFolders).set(patch).where(eq(subjectFolders.id, id));
  const what = patch.name && patch.name !== folder.name ? `Đổi tên thư mục “${folder.name}” → “${patch.name}”` : `Sửa thư mục “${folder.name}”`;
  await logActivity(actorId, patch.parentId !== undefined ? 'move' : 'update', 'folder', id, what);
  return (await listFolders(folder.subjectId)).find((f) => f.id === id)!;
}

/**
 * Deleting a folder never deletes documents: they and the subfolders move up
 * to the folder's parent (or out of any folder at the top level).
 */
export async function deleteFolder(actorId: string, id: string) {
  const folder = await folderById(id);
  const [docs] = await db.select({ value: count() }).from(documents).where(eq(documents.folderId, id));
  await db.update(documents).set({ folderId: folder.parentId }).where(eq(documents.folderId, id));
  await db.update(subjectFolders).set({ parentId: folder.parentId }).where(eq(subjectFolders.parentId, id));
  await db.delete(subjectFolders).where(eq(subjectFolders.id, id));
  await logActivity(
    actorId,
    'delete',
    'folder',
    id,
    `Xoá thư mục “${folder.name}”${docs?.value ? ` (${docs.value} tài liệu chuyển ra ngoài)` : ''}`,
  );
}

export async function moveDocuments(actorId: string, input: MoveDocumentsInput) {
  const rows = await db
    .select({ id: documents.id, subjectId: documents.subjectId })
    .from(documents)
    .where(inArray(documents.id, input.ids));
  if (!rows.length) return { moved: 0 };
  let target: SubjectFolderRow | null = null;
  if (input.folderId) {
    target = await folderById(input.folderId);
    if (rows.some((r) => r.subjectId !== target!.subjectId)) {
      throw ApiError.badRequest('Chỉ chuyển được tài liệu cùng môn với thư mục đích.');
    }
  }
  await db.update(documents).set({ folderId: target?.id ?? null }).where(inArray(documents.id, rows.map((r) => r.id)));
  await logActivity(actorId, 'move', 'document', null, `Chuyển ${rows.length} tài liệu ${target ? `vào “${target.name}”` : 'ra khỏi thư mục'}`);
  return { moved: rows.length };
}
