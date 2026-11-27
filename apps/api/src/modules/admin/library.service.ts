import { sql } from 'drizzle-orm';
import type { AdminUserLibraryDto, LibraryDocDto } from '@kaned/shared';
import { db } from '../../db/index.js';
import { notFound } from './util.js';

/*
 * Everything one person keeps on Kaned, for admins: saved documents and
 * collections, what they uploaded, downloaded and rated, their flashcard
 * progress, exam rooms and files, and group-meeting events.
 */

const LIMIT = 300;
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const n = (v: unknown) => Number(v) || 0;

type DocCols = { id: string; title: string | null; code: string | null; format: string | null; file_bytes: number | null; status: string | null };
const doc = (r: DocCols, fallback?: string | null): LibraryDocDto => ({
  id: r.id,
  title: r.title ?? fallback ?? 'Tài liệu đã xoá',
  subjectCode: r.code,
  format: r.format,
  bytes: r.file_bytes == null ? null : n(r.file_bytes),
  status: r.status,
  ...(r.title == null ? { missing: true } : {}),
});

export async function userLibrary(userId: string): Promise<AdminUserLibraryDto> {
  const exists = await db.execute<{ id: string }>(sql`select id from users where id = ${userId}`);
  if (![...exists].length) notFound('người dùng');

  const [saved, cols, uploads, downloads, reviews, decks, exams, files, meets] = await Promise.all([
    db.execute<DocCols & { saved_at: Date; collections: string[] | null }>(sql`
      select d.id, d.title, s.code, d.format::text as format, d.file_bytes, d.status::text as status, b.created_at as saved_at,
        (select array_agg(c.name order by c.name) from collection_items ci join collections c on c.id = ci.collection_id
          where c.user_id = ${userId} and ci.document_id = d.id) as collections
      from bookmarks b join documents d on d.id = b.document_id join subjects s on s.id = d.subject_id
      where b.user_id = ${userId}
      order by b.created_at desc limit ${LIMIT}`),
    db.execute<{ cid: string; name: string; created_at: Date } & Partial<DocCols> & { added_at: Date | null }>(sql`
      select c.id as cid, c.name, c.created_at, d.id, d.title, s.code, d.format::text as format, d.file_bytes, d.status::text as status, ci.created_at as added_at
      from collections c
      left join collection_items ci on ci.collection_id = c.id
      left join documents d on d.id = ci.document_id
      left join subjects s on s.id = d.subject_id
      where c.user_id = ${userId}
      order by c.created_at desc, ci.created_at desc`),
    db.execute<DocCols & { downloads: number; views: number; rating_avg: number; rating_count: number; created_at: Date }>(sql`
      select d.id, d.title, s.code, d.format::text as format, d.file_bytes, d.status::text as status, d.downloads, d.views, d.rating_avg, d.rating_count, d.created_at
      from documents d join subjects s on s.id = d.subject_id
      where d.uploader_id = ${userId}
      order by d.created_at desc limit ${LIMIT}`),
    db.execute<{ doc_id: string; label: string | null; times: number; last_at: Date } & Omit<DocCols, 'id'>>(sql`
      select e.doc_id, e.label, e.times, e.last_at, d.title, s.code, d.format::text as format, d.file_bytes, d.status::text as status
      from (
        select data->>'documentId' as doc_id, max(data->>'title') as label, count(*)::int as times, max(created_at) as last_at
        from user_events where user_id = ${userId} and type = 'download' and data ? 'documentId'
        group by 1
      ) e
      left join documents d on d.id = e.doc_id
      left join subjects s on s.id = d.subject_id
      order by e.last_at desc limit ${LIMIT}`),
    db.execute<DocCols & { score: number; comment: string; at: Date }>(sql`
      select d.id, d.title, s.code, d.format::text as format, d.file_bytes, d.status::text as status, r.score, r.comment, r.updated_at as at
      from reviews r join documents d on d.id = r.document_id join subjects s on s.id = d.subject_id
      where r.user_id = ${userId}
      order by r.updated_at desc limit ${LIMIT}`),
    db.execute<{ deck_id: string; title: string; code: string | null; question_count: number; seen: number; ok: number; bad: number; marked: number; sessions: number; answers: number; updated_at: Date }>(sql`
      select p.deck_id, dk.title, s.code, dk.question_count, p.seen, p.ok, p.bad, p.marked, p.sessions, p.answers, p.updated_at
      from deck_progress p join decks dk on dk.id = p.deck_id left join subjects s on s.id = dk.subject_id
      where p.user_id = ${userId}
      order by p.updated_at desc limit ${LIMIT}`),
    db.execute<{ session_id: string; title: string; subject_code: string; kind: string; attempts: number; best: number | null; counted: number | null; passed: boolean | null; last_at: Date }>(sql`
      select vs.id as session_id, vs.title, vs.subject_code, vs.kind, vp.counted_score10 as counted,
        (select count(*)::int from vec_attempts a where a.session_id = vs.id and a.user_id = ${userId}) as attempts,
        (select max(a.score10) from vec_attempts a where a.session_id = vs.id and a.user_id = ${userId}) as best,
        (select bool_or(a.passed) from vec_attempts a where a.session_id = vs.id and a.user_id = ${userId}) as passed,
        greatest(vp.joined_at, (select max(coalesce(a.submitted_at, a.started_at)) from vec_attempts a where a.session_id = vs.id and a.user_id = ${userId})) as last_at
      from vec_participants vp join vec_sessions vs on vs.id = vp.session_id
      where vp.user_id = ${userId}
      order by last_at desc nulls last limit ${LIMIT}`),
    db.execute<{ id: string; name: string; format: string; bytes: number; role: string; session_title: string | null; created_at: Date }>(sql`
      select f.id, f.name, f.format, f.bytes, f.role, vs.title as session_title, f.created_at
      from vec_files f left join vec_sessions vs on vs.id = f.session_id
      where f.owner_id = ${userId} and f.status = 'READY'
      order by f.created_at desc limit ${LIMIT}`),
    db.execute<{ slug: string; title: string; owner: boolean; status: string; free: number; saved_at: Date | null; updated_at: Date }>(sql`
      select e.slug, e.title, (e.owner_id = ${userId}) as owner, e.status,
        coalesce((select sum(jsonb_array_length(v)) from jsonb_each(p.free) as j(k, v)), 0)::int as free,
        p.saved_at, e.updated_at
      from meet_events e
      left join meet_participants p on p.event_id = e.id and p.user_id = ${userId}
      where e.owner_id = ${userId} or p.user_id = ${userId}
      order by e.updated_at desc limit ${LIMIT}`),
  ]);

  const byCol = new Map<string, AdminUserLibraryDto['collections'][number]>();
  for (const r of cols) {
    const c = byCol.get(r.cid) ?? { id: r.cid, name: r.name, createdAt: iso(r.created_at)!, docs: [] };
    if (r.id) c.docs.push({ ...doc(r as DocCols), addedAt: iso(r.added_at)! });
    byCol.set(r.cid, c);
  }

  const out: AdminUserLibraryDto = {
    counts: { saved: 0, collections: 0, uploads: 0, downloads: 0, reviews: 0, decks: 0, exams: 0, files: 0, meets: 0 },
    saved: [...saved].map((r) => ({ ...doc(r), savedAt: iso(r.saved_at)!, collections: r.collections ?? [] })),
    collections: [...byCol.values()],
    uploads: [...uploads].map((r) => ({ ...doc(r), downloads: n(r.downloads), views: n(r.views), ratingAvg: n(r.rating_avg), ratingCount: n(r.rating_count), createdAt: iso(r.created_at)! })),
    downloads: [...downloads].map((r) => ({ ...doc({ ...r, id: r.doc_id }, r.label), times: n(r.times), lastAt: iso(r.last_at)! })),
    reviews: [...reviews].map((r) => ({ doc: doc(r), score: n(r.score), comment: r.comment, at: iso(r.at)! })),
    decks: [...decks].map((r) => ({ deckId: r.deck_id, title: r.title, subjectCode: r.code, questions: n(r.question_count), seen: n(r.seen), ok: n(r.ok), bad: n(r.bad), marked: n(r.marked), sessions: n(r.sessions), answers: n(r.answers), updatedAt: iso(r.updated_at)! })),
    exams: [...exams].map((r) => ({ sessionId: r.session_id, title: r.title, subjectCode: r.subject_code, kind: r.kind, attempts: n(r.attempts), best: r.best == null ? null : Number(r.best), counted: r.counted == null ? null : Number(r.counted), passed: r.passed, lastAt: iso(r.last_at) ?? new Date(0).toISOString() })),
    files: [...files].map((r) => ({ id: r.id, name: r.name, format: r.format, bytes: n(r.bytes), role: r.role, sessionTitle: r.session_title, createdAt: iso(r.created_at)! })),
    meets: [...meets].map((r) => ({ slug: r.slug, title: r.title, owner: Boolean(r.owner), status: r.status, free: n(r.free), savedAt: iso(r.saved_at), updatedAt: iso(r.updated_at)! })),
  };
  out.counts = {
    saved: out.saved.length,
    collections: out.collections.length,
    uploads: out.uploads.length,
    downloads: out.downloads.length,
    reviews: out.reviews.length,
    decks: out.decks.length,
    exams: out.exams.length,
    files: out.files.length,
    meets: out.meets.length,
  };
  return out;
}
