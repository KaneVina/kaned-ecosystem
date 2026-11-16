import type { Request } from 'express';
import { and, desc, eq, gt, ilike, isNull, lt, sql } from 'drizzle-orm';
import type { StartViewDto, StartViewInput, TrackedKind } from '@kaned/shared';
import { db } from '../../db/index.js';
import { activitySessions, documents, pageViews, subjects, userEvents, users } from '../../db/schema.js';
import { seal, unseal } from '../../lib/seal.js';
import { parseUserAgent } from '../../lib/userAgent.js';
import { clientIp } from '../../lib/track.js';

/** Silence longer than this ends a visit; the next page starts a new one. */
const VISIT_GAP_MS = 30 * 60 * 1000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
/** One check-in never adds more than this, whatever the client claims. */
const MAX_PING_SECONDS = 15 * 60;

const PAGE_LABELS: Array<[RegExp, string]> = [
  [/^\/app\/?$/, 'Tổng quan'],
  [/^\/app\/library\/?$/, 'Thư viện'],
  [/^\/app\/upload/, 'Tải lên tài liệu'],
  [/^\/app\/subjects\/?$/, 'Môn học & điều kiện'],
  [/^\/app\/tools\/gpa/, 'Tính GPA'],
  [/^\/app\/profile/, 'Hồ sơ của mình'],
  [/^\/app\/saved/, 'Tài liệu đã lưu'],
  [/^\/app\/settings/, 'Cài đặt tài khoản'],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function labelFor(userId: string, kind: TrackedKind, path: string, entityId?: string | null) {
  if (kind === 'document' && entityId && UUID.test(entityId)) {
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, entityId), columns: { title: true } });
    if (doc) return doc.title;
  }
  if (kind === 'subject' && entityId) {
    const me = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { universityId: true } });
    const rows = await db.query.subjects.findMany({
      where: ilike(subjects.code, entityId.replace(/[%_]/g, '')),
      columns: { code: true, nameVi: true, universityId: true },
      limit: 5,
    });
    const hit = rows.find((r) => r.universityId === me?.universityId) ?? rows[0];
    if (hit) return `${hit.code} · ${hit.nameVi}`;
  }
  const [pathname, search = ''] = path.split('?');
  const base = PAGE_LABELS.find(([re]) => re.test(pathname))?.[1] ?? pathname;
  const q = new URLSearchParams(search).get('q');
  return q && base === 'Thư viện' ? `Thư viện · tìm “${q.slice(0, 60)}”` : base;
}

interface ViewToken {
  v: string;
  s: string;
  u: string;
}

/** Opens a page view, continuing the tab's visit or starting a new one. */
export async function startView(userId: string, input: StartViewInput, req: Request): Promise<StartViewDto> {
  const now = new Date();
  let session = await db.query.activitySessions.findFirst({
    where: and(
      eq(activitySessions.userId, userId),
      eq(activitySessions.clientId, input.clientId),
      gt(activitySessions.lastSeenAt, new Date(now.getTime() - VISIT_GAP_MS)),
    ),
    orderBy: desc(activitySessions.lastSeenAt),
    columns: { id: true },
  });

  if (!session) {
    const ua = req.get('user-agent') ?? '';
    const device = parseUserAgent(ua);
    [session] = await db
      .insert(activitySessions)
      .values({ userId, clientId: input.clientId, ip: clientIp(req), userAgent: ua.slice(0, 300), ...device })
      .returning({ id: activitySessions.id });
  } else {
    // A view whose last check-in got lost (closed laptop, dropped beacon) ends where it was last seen.
    await db
      .update(pageViews)
      .set({ endedAt: sql`${pageViews.lastPingAt}` })
      .where(and(eq(pageViews.sessionId, session.id), isNull(pageViews.endedAt)));
  }

  const [view] = await db
    .insert(pageViews)
    .values({
      sessionId: session.id,
      userId,
      path: input.path,
      kind: input.kind,
      entityId: input.entityId ?? null,
      label: await labelFor(userId, input.kind, input.path, input.entityId),
    })
    .returning({ id: pageViews.id });

  await Promise.all([
    db
      .update(activitySessions)
      .set({ pageCount: sql`${activitySessions.pageCount} + 1`, lastSeenAt: now })
      .where(eq(activitySessions.id, session.id)),
    db.update(users).set({ lastSeenAt: now }).where(eq(users.id, userId)),
  ]);

  return { viewId: view.id, token: seal('activity-view', { v: view.id, s: session.id, u: userId } satisfies ViewToken, TOKEN_TTL_MS) };
}

/**
 * A check-in from an open tab: adds the visible, non-idle seconds since the
 * last one and marks the person as here. The time is capped by the real time
 * that passed, so a client cannot inflate it.
 */
export async function ping(token: string, rawSeconds: unknown, final: boolean) {
  const t = unseal<ViewToken>('activity-view', token);
  if (!t) return false;
  const view = await db.query.pageViews.findFirst({
    where: eq(pageViews.id, t.v),
    columns: { lastPingAt: true, endedAt: true },
  });
  if (!view) return false;

  const now = new Date();
  const elapsed = (now.getTime() - view.lastPingAt.getTime()) / 1000;
  const claimed = Math.round(Number(rawSeconds) || 0);
  // A little slack for network delay on normal check-ins, none for rapid-fire ones,
  // so sending many pings can never add more time than really passed.
  const allowed = elapsed >= 10 ? elapsed + 3 : elapsed;
  const seconds = Math.floor(Math.max(0, Math.min(claimed, allowed, MAX_PING_SECONDS)));

  await Promise.all([
    db
      .update(pageViews)
      .set({
        seconds: sql`${pageViews.seconds} + ${seconds}`,
        lastPingAt: now,
        ...(final ? { endedAt: now } : view.endedAt ? { endedAt: null } : {}),
      })
      .where(eq(pageViews.id, t.v)),
    db
      .update(activitySessions)
      .set({ activeSeconds: sql`${activitySessions.activeSeconds} + ${seconds}`, lastSeenAt: now })
      .where(eq(activitySessions.id, t.s)),
    final ? Promise.resolve() : db.update(users).set({ lastSeenAt: now }).where(eq(users.id, t.u)),
  ]);
  return true;
}

/** Drops history older than the retention period (ACTIVITY_RETENTION_DAYS). */
export async function sweepActivity(retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  await db.delete(pageViews).where(lt(pageViews.startedAt, cutoff));
  await db.delete(activitySessions).where(lt(activitySessions.lastSeenAt, cutoff));
  await db.delete(userEvents).where(lt(userEvents.createdAt, cutoff));
}
