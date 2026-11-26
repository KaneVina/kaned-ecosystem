import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import {
  VI_FOLD_FROM_TO,
  foldText,
  type AssistantDeckHit,
  type AssistantDocHit,
  type AssistantLecturerHit,
  type AssistantSearchResult,
  type AssistantSubjectHit,
  type assistantSearchSchema,
} from '@kaned/shared';
import type { z } from 'zod';
import { db } from '../../db/index.js';
import { decks, documentTags, documents, lecturers, subjects, tags } from '../../db/schema.js';

type Query = z.output<typeof assistantSearchSchema>;

/** translate(lower(x)) strips Vietnamese tone marks inside Postgres, no extension needed. */
const fold = (col: SQL | unknown) => sql`translate(lower(coalesce(${col}, '')), ${VI_FOLD_FROM_TO.from}, ${VI_FOLD_FROM_TO.to})`;
const likeArg = (t: string) => `%${t.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

const CANDIDATES = 300;

/** Splits folded keywords; very short words only count when they are numbers or codes. */
function tokensOf(q: string | undefined): string[] {
  if (!q) return [];
  const seen = new Set<string>();
  for (const w of foldText(q).split(/[^a-z0-9+#.]+/)) {
    const t = w.replace(/^\.+|\.+$/g, '');
    if (!t || (t.length < 2 && !/\d/.test(t))) continue;
    seen.add(t);
    if (seen.size >= 10) break;
  }
  return [...seen];
}

const wordHit = (hay: string, t: string) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(hay);

export async function assistantSearch(query: Query, viewerId?: string): Promise<AssistantSearchResult> {
  const started = Date.now();
  const kinds = new Set(query.kinds.length ? query.kinds : ['docs', 'decks', 'subjects', 'lecturers']);
  const tokens = tokensOf(query.q);
  const termTok = query.term ? query.term.toLowerCase() : null;

  // The subject code, resolved across schools.
  const subjectRows = query.subject
    ? await db.select({ id: subjects.id, code: subjects.code, name: subjects.name, nameVi: subjects.nameVi }).from(subjects).where(sql`upper(${subjects.code}) = ${query.subject}`)
    : [];
  const subjectIds = subjectRows.map((s) => s.id);
  const subjectMissing = Boolean(query.subject) && !subjectIds.length;

  const [docs, deckHits, subjectHits, lecturerHits] = await Promise.all([
    kinds.has('docs') && !subjectMissing ? searchDocs(query, tokens, termTok, subjectIds, viewerId) : Promise.resolve({ items: [], total: 0, capped: false }),
    kinds.has('decks') && !subjectMissing ? searchDecks(tokens, subjectIds, query.limit) : Promise.resolve([]),
    kinds.has('subjects') ? searchSubjects(tokens, query.subject) : Promise.resolve([]),
    kinds.has('lecturers') && viewerId && tokens.length ? searchLecturers(tokens) : Promise.resolve([]),
  ]);

  const s0 = subjectRows[0];
  return {
    subject: s0 ? { id: s0.id, code: s0.code, name: s0.name, nameVi: s0.nameVi } : null,
    subjectIds,
    docs: { ...docs, items: docs.items.slice(0, query.limit) },
    decks: deckHits,
    subjects: subjectHits,
    lecturers: lecturerHits,
    ...(kinds.has('lecturers') && !viewerId && query.kinds.includes('lecturers') ? { lecturersNeedLogin: true } : {}),
    tookMs: Date.now() - started,
  };
}

async function searchDocs(query: Query, tokens: string[], termTok: string | null, subjectIds: string[], viewerId?: string) {
  const filters: SQL[] = [eq(documents.status, 'PUBLISHED')];
  if (!viewerId) filters.push(eq(documents.internal, false));
  if (subjectIds.length) filters.push(inArray(documents.subjectId, subjectIds));
  if (query.types.length) filters.push(inArray(documents.type, query.types as never[]));
  if (query.formats.length) filters.push(inArray(documents.format, query.formats as never[]));
  if (query.year) filters.push(eq(documents.year, query.year));

  const tagText = sql`(select string_agg(t.name, ' ') from ${documentTags} dt join ${tags} t on t.id = dt.tag_id where dt.document_id = "documents"."id")`;
  // The term (SU25…) only lifts documents that mention it; it never hides the rest.
  const words = tokens;
  if (words.length) {
    const any = words.map((t) => {
      const a = likeArg(t);
      return or(
        sql`${fold(documents.title)} like ${a}`,
        sql`${fold(documents.description)} like ${a}`,
        sql`${fold(subjects.code)} like ${a}`,
        sql`${fold(subjects.name)} like ${a}`,
        sql`${fold(subjects.nameVi)} like ${a}`,
        sql`${fold(tagText)} like ${a}`,
      )!;
    });
    filters.push(or(...any)!);
  }

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      description: documents.description,
      type: documents.type,
      format: documents.format,
      downloads: documents.downloads,
      views: documents.views,
      ratingAvg: documents.ratingAvg,
      ratingCount: documents.ratingCount,
      pages: documents.pages,
      year: documents.year,
      internal: documents.internal,
      createdAt: documents.createdAt,
      subjectCode: subjects.code,
      subjectName: subjects.name,
      subjectNameVi: subjects.nameVi,
      tagText,
    })
    .from(documents)
    .innerJoin(subjects, eq(subjects.id, documents.subjectId))
    .where(and(...filters))
    .orderBy(desc(documents.downloads), desc(documents.createdAt))
    .limit(CANDIDATES + 1);

  const capped = rows.length > CANDIDATES;
  const list = rows.slice(0, CANDIDATES);

  // Rarer words weigh more (idf over the candidates).
  const prepared = list.map((r) => ({
    r,
    title: foldText(r.title),
    desc: foldText(r.description ?? ''),
    subj: foldText(`${r.subjectCode} ${r.subjectName} ${r.subjectNameVi ?? ''}`),
    tags: foldText(String(r.tagText ?? '')),
  }));
  const df = new Map<string, number>();
  for (const t of words) df.set(t, prepared.filter((p) => p.title.includes(t) || p.desc.includes(t) || p.subj.includes(t) || p.tags.includes(t)).length);
  const N = Math.max(1, prepared.length);
  const idf = (t: string) => Math.log(1 + N / Math.max(1, df.get(t) ?? 1));

  const scored = prepared.map((p) => {
    let score = 0;
    let matched = 0;
    const why = new Set<string>();
    for (const t of words) {
      const w = idf(t);
      let hit = 0;
      if (p.title.includes(t)) {
        hit = Math.max(hit, wordHit(p.title, t) ? 4 : 2.5);
        why.add('tiêu đề');
      }
      if (p.tags.includes(t)) {
        hit = Math.max(hit, 3);
        why.add('thẻ');
      }
      if (p.subj.includes(t)) {
        hit = Math.max(hit, 2.5);
        why.add('môn');
      }
      if (p.desc.includes(t)) {
        hit = Math.max(hit, wordHit(p.desc, t) ? 1.5 : 1);
        why.add('mô tả');
      }
      if (hit) matched++;
      score += hit * w;
    }
    if (termTok && (p.title.includes(termTok) || p.tags.includes(termTok) || p.desc.includes(termTok))) {
      score += 4;
      why.add('đúng kỳ');
    }
    // Words that sit next to each other in the title as they did in the question.
    for (let i = 0; i + 1 < tokens.length; i++) if (p.title.includes(`${tokens[i]} ${tokens[i + 1]}`)) score += 3;
    if (words.length) score *= 0.4 + 0.6 * (matched / words.length);
    else score = 1;
    const r = p.r;
    score += Math.log10(1 + (r.downloads ?? 0)) * 0.6 + (r.ratingCount ? (r.ratingAvg ?? 0) * 0.15 : 0);
    const ageDays = (Date.now() - r.createdAt.getTime()) / 86_400_000;
    score += Math.max(0, 0.6 - ageDays / 900);
    if (subjectIds.length) why.add('đúng môn');
    return { r, score, matched, why: [...why] };
  });

  // With several keywords, keep documents that match a fair share of them.
  const need = words.length >= 3 ? Math.ceil(words.length / 2) : words.length ? 1 : 0;
  const good = scored.filter((x) => x.matched >= need).sort((a, b) => b.score - a.score);
  const items: AssistantDocHit[] = good.slice(0, 12).map(({ r, why }) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    format: r.format,
    subjectCode: r.subjectCode,
    subjectName: r.subjectNameVi || r.subjectName,
    downloads: r.downloads ?? 0,
    ratingAvg: Number(r.ratingAvg ?? 0),
    ratingCount: r.ratingCount ?? 0,
    pages: r.pages,
    year: r.year,
    internal: r.internal,
    createdAt: r.createdAt.getTime(),
    why,
  }));
  return { items, total: good.length, capped };
}

async function searchDecks(tokens: string[], subjectIds: string[], limit: number): Promise<AssistantDeckHit[]> {
  const filters: SQL[] = [eq(decks.status, 'PUBLISHED')];
  if (subjectIds.length) filters.push(inArray(decks.subjectId, subjectIds));
  else if (tokens.length) {
    filters.push(
      or(
        ...tokens.map((t) => {
          const a = likeArg(t);
          return or(sql`${fold(decks.title)} like ${a}`, sql`${fold(subjects.code)} like ${a}`, sql`${fold(subjects.name)} like ${a}`, sql`${fold(subjects.nameVi)} like ${a}`)!;
        }),
      )!,
    );
  } else return [];
  const rows = await db
    .select({ id: decks.id, title: decks.title, questionCount: decks.questionCount, tipCount: decks.tipCount, code: subjects.code, name: subjects.name, nameVi: subjects.nameVi })
    .from(decks)
    .innerJoin(subjects, eq(subjects.id, decks.subjectId))
    .where(and(...filters))
    .orderBy(desc(decks.questionCount))
    .limit(Math.min(limit, 4));
  return rows.map((r) => ({ id: r.id, title: r.title, subjectCode: r.code, subjectName: r.nameVi || r.name, questionCount: r.questionCount ?? 0, tipCount: r.tipCount ?? 0 }));
}

async function searchSubjects(tokens: string[], code?: string): Promise<AssistantSubjectHit[]> {
  let where: SQL | undefined;
  if (code) where = sql`upper(${subjects.code}) = ${code}`;
  else if (tokens.length) {
    // All words must appear in the code or a name: "cau truc du lieu" should not list every subject with "du".
    where = and(
      ...tokens.map((t) => {
        const a = likeArg(t);
        return or(sql`${fold(subjects.code)} like ${a}`, sql`${fold(subjects.name)} like ${a}`, sql`${fold(subjects.nameVi)} like ${a}`)!;
      }),
    );
  } else return [];
  const rows = await db
    .select({
      id: subjects.id,
      code: subjects.code,
      name: subjects.name,
      nameVi: subjects.nameVi,
      credits: subjects.credits,
      docCount: sql<number>`(select count(*)::int from ${documents} d where d.subject_id = "subjects"."id" and d.status = 'PUBLISHED')`,
      deckId: sql<string | null>`(select k.id from ${decks} k where k.subject_id = "subjects"."id" and k.status = 'PUBLISHED' order by k.question_count desc limit 1)`,
    })
    .from(subjects)
    .where(where)
    .limit(4);
  return rows.map((r) => ({ ...r, credits: r.credits ?? null, docCount: Number(r.docCount) || 0 }));
}

async function searchLecturers(tokens: string[]): Promise<AssistantLecturerHit[]> {
  const rows = await db
    .select({ id: lecturers.id, fullName: lecturers.fullName, code: lecturers.code, department: lecturers.department, email: lecturers.email, kind: lecturers.kind })
    .from(lecturers)
    .where(and(...tokens.map((t) => sql`${fold(lecturers.search)} like ${likeArg(t)}`)))
    .limit(4);
  return rows.map((r) => ({ ...r, code: r.code ?? null, department: r.department ?? null, email: r.email ?? null, kind: String(r.kind) }));
}
