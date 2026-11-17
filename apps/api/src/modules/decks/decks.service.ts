import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import {
  parseDeck,
  type AdminDeckDetailDto,
  type AdminDeckDto,
  type DeckDetailDto,
  type DeckInput,
  type DeckListQuery,
  type DeckProgress,
  type DeckProgressSummary,
  type DeckStatus,
  type DeckSummaryDto,
  type DeckUpdate,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { deckProgress, decks, subjects, universities, users } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { logActivity } from '../../lib/activity.js';

/* Every column but the heavy ones, for lists. */
const listColumns = {
  id: decks.id,
  title: decks.title,
  description: decks.description,
  status: decks.status,
  questionCount: decks.questionCount,
  tipCount: decks.tipCount,
  chapterCount: decks.chapterCount,
  createdById: decks.createdById,
  createdAt: decks.createdAt,
  updatedAt: decks.updatedAt,
  subjectId: subjects.id,
  subjectCode: subjects.code,
  subjectName: subjects.nameVi,
  universityId: universities.id,
  universityCode: universities.code,
  universityColor: universities.color,
};

type ListRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  questionCount: number;
  tipCount: number;
  chapterCount: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  universityId: string;
  universityCode: string;
  universityColor: string;
};

const summaryOf = (r: ListRow): Omit<DeckSummaryDto, 'progress'> => ({
  id: r.id,
  title: r.title,
  description: r.description,
  status: r.status as DeckStatus,
  questionCount: r.questionCount,
  tipCount: r.tipCount,
  chapterCount: r.chapterCount,
  updatedAt: r.updatedAt.toISOString(),
  subject: {
    id: r.subjectId,
    code: r.subjectCode,
    nameVi: r.subjectName,
    university: { id: r.universityId, code: r.universityCode, color: r.universityColor },
  },
});

function filters(query: DeckListQuery, publishedOnly: boolean): SQL | undefined {
  const where: SQL[] = [];
  if (publishedOnly) where.push(eq(decks.status, 'PUBLISHED'));
  if (query.subjectId) where.push(eq(decks.subjectId, query.subjectId));
  if (query.universityId) where.push(eq(subjects.universityId, query.universityId));
  if (query.q) {
    const like = `%${query.q}%`;
    where.push(or(ilike(decks.title, like), ilike(subjects.code, like), ilike(subjects.nameVi, like))!);
  }
  return where.length ? and(...where) : undefined;
}

const progressSummary = (p: { seen: number; ok: number; bad: number; marked: number; updatedAt: Date }): DeckProgressSummary => ({
  seen: p.seen,
  ok: p.ok,
  bad: p.bad,
  marked: p.marked,
  updatedAt: p.updatedAt.toISOString(),
});

/* ─────────────────────────────── learners ─────────────────────────────── */

export async function listDecks(userId: string, query: DeckListQuery): Promise<DeckSummaryDto[]> {
  const rows = (await db
    .select(listColumns)
    .from(decks)
    .innerJoin(subjects, eq(subjects.id, decks.subjectId))
    .innerJoin(universities, eq(universities.id, subjects.universityId))
    .where(filters(query, true))
    .orderBy(asc(subjects.code), asc(decks.title))) as ListRow[];
  if (!rows.length) return [];
  const mine = await db
    .select({ deckId: deckProgress.deckId, seen: deckProgress.seen, ok: deckProgress.ok, bad: deckProgress.bad, marked: deckProgress.marked, updatedAt: deckProgress.updatedAt })
    .from(deckProgress)
    .where(and(eq(deckProgress.userId, userId), inArray(deckProgress.deckId, rows.map((r) => r.id))));
  const byDeck = new Map(mine.map((p) => [p.deckId, p]));
  return rows.map((r) => {
    const p = byDeck.get(r.id);
    return { ...summaryOf(r), progress: p ? progressSummary(p) : null };
  });
}

export async function getDeck(userId: string, id: string, isStaff: boolean): Promise<DeckDetailDto> {
  const [row] = (await db
    .select({ ...listColumns, content: decks.content })
    .from(decks)
    .innerJoin(subjects, eq(subjects.id, decks.subjectId))
    .innerJoin(universities, eq(universities.id, subjects.universityId))
    .where(eq(decks.id, id))
    .limit(1)) as Array<ListRow & { content: DeckDetailDto['content'] }>;
  if (!row || (row.status !== 'PUBLISHED' && !isStaff)) throw ApiError.notFound('Không tìm thấy bộ đề này.');
  const [p] = await db
    .select()
    .from(deckProgress)
    .where(and(eq(deckProgress.userId, userId), eq(deckProgress.deckId, id)))
    .limit(1);
  return { ...summaryOf(row), content: row.content, progress: p ? progressSummary(p) : null, state: p?.state ?? null };
}

export async function saveProgress(userId: string, id: string, state: DeckProgress, isStaff: boolean): Promise<DeckProgressSummary> {
  const [deck] = await db.select({ status: decks.status }).from(decks).where(eq(decks.id, id)).limit(1);
  if (!deck || (deck.status !== 'PUBLISHED' && !isStaff)) throw ApiError.notFound('Không tìm thấy bộ đề này.');
  const marks = Object.values(state.st);
  const counts = {
    seen: marks.length,
    ok: marks.filter((m) => m.l === 1).length,
    bad: marks.filter((m) => m.l === 0).length,
    marked: Object.keys(state.mk).length,
  };
  const [row] = await db
    .insert(deckProgress)
    .values({ userId, deckId: id, state, ...counts })
    .onConflictDoUpdate({ target: [deckProgress.userId, deckProgress.deckId], set: { state, ...counts, updatedAt: new Date() } })
    .returning();
  return progressSummary(row);
}

/* ──────────────────────────────── admins ──────────────────────────────── */

/** Reads the file and refuses it while it has errors, quoting the first few with their lines. */
function readSource(source: string) {
  const parsed = parseDeck(source);
  const errors = parsed.issues.filter((i) => i.level === 'error');
  if (errors.length) {
    const first = errors
      .slice(0, 3)
      .map((e) => `dòng ${e.line}: ${e.message}`)
      .join('; ');
    throw ApiError.badRequest(`File còn ${errors.length} lỗi — ${first}${errors.length > 3 ? '…' : ''}`, { source: first });
  }
  return parsed.content;
}

const countsOf = (content: ReturnType<typeof readSource>) => ({
  questionCount: content.questions.length,
  tipCount: content.tips.length,
  chapterCount: content.chapters.length,
});

async function adminRows(where?: SQL) {
  const rows = (await db
    .select(listColumns)
    .from(decks)
    .innerJoin(subjects, eq(subjects.id, decks.subjectId))
    .innerJoin(universities, eq(universities.id, subjects.universityId))
    .where(where)
    .orderBy(desc(decks.updatedAt))) as ListRow[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const creatorIds = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => Boolean(x)))];
  const [learners, creators] = await Promise.all([
    db.select({ deckId: deckProgress.deckId, value: count() }).from(deckProgress).where(inArray(deckProgress.deckId, ids)).groupBy(deckProgress.deckId),
    creatorIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, creatorIds)) : Promise.resolve([]),
  ]);
  const learnersBy = new Map(learners.map((l) => [l.deckId, Number(l.value)]));
  const creatorBy = new Map(creators.map((c) => [c.id, c]));
  return rows.map(
    (r): AdminDeckDto => ({
      ...summaryOf(r),
      learners: learnersBy.get(r.id) ?? 0,
      createdBy: r.createdById ? (creatorBy.get(r.createdById) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    }),
  );
}

export const listDecksAdmin = (query: DeckListQuery) => adminRows(filters(query, false));

export async function getDeckAdmin(id: string): Promise<AdminDeckDetailDto> {
  const [dto] = await adminRows(eq(decks.id, id));
  if (!dto) throw ApiError.notFound('Không tìm thấy bộ đề này.');
  const [{ source }] = await db.select({ source: decks.source }).from(decks).where(eq(decks.id, id));
  return { ...dto, source };
}

async function assertSubject(subjectId: string) {
  const [s] = await db.select({ code: subjects.code }).from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  if (!s) throw ApiError.badRequest('Môn học không tồn tại.', { subjectId: 'Chọn lại môn học' });
  return s.code;
}

/** Writes answer with the list row, not the file, to keep stored replies small. */
async function adminRow(id: string): Promise<AdminDeckDto> {
  const [dto] = await adminRows(eq(decks.id, id));
  if (!dto) throw ApiError.notFound('Không tìm thấy bộ đề này.');
  return dto;
}

export async function createDeck(actorId: string, input: DeckInput): Promise<AdminDeckDto> {
  const content = readSource(input.source);
  const code = await assertSubject(input.subjectId);
  const [row] = await db
    .insert(decks)
    .values({
      subjectId: input.subjectId,
      title: input.title,
      description: input.description?.trim() || null,
      status: input.status,
      source: input.source,
      content,
      ...countsOf(content),
      createdById: actorId,
    })
    .returning({ id: decks.id });
  await logActivity(actorId, 'create', 'deck', row.id, `Nhập bộ đề “${input.title}” (${code}, ${content.questions.length} câu)`);
  return adminRow(row.id);
}

export async function updateDeck(actorId: string, id: string, input: DeckUpdate): Promise<AdminDeckDto> {
  const [before] = await db.select({ title: decks.title, status: decks.status }).from(decks).where(eq(decks.id, id)).limit(1);
  if (!before) throw ApiError.notFound('Không tìm thấy bộ đề này.');
  const content = input.source !== undefined ? readSource(input.source) : null;
  if (input.subjectId) await assertSubject(input.subjectId);
  await db
    .update(decks)
    .set({
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(content ? { source: input.source!, content, ...countsOf(content) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(decks.id, id));
  const what =
    input.status && input.status !== before.status && !content
      ? input.status === 'PUBLISHED'
        ? 'Hiện bộ đề'
        : 'Ẩn bộ đề'
      : content
        ? 'Cập nhật nội dung bộ đề'
        : 'Sửa bộ đề';
  await logActivity(actorId, 'update', 'deck', id, `${what} “${input.title ?? before.title}”`);
  return adminRow(id);
}

export async function deleteDeck(actorId: string, id: string) {
  const [row] = await db.delete(decks).where(eq(decks.id, id)).returning({ title: decks.title });
  if (!row) throw ApiError.notFound('Không tìm thấy bộ đề này.');
  await logActivity(actorId, 'delete', 'deck', id, `Xoá bộ đề “${row.title}”`);
}
