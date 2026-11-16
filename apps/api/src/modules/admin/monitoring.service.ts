import { and, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import {
  OAUTH_PROVIDERS,
  ONLINE_WINDOW_SECONDS,
  type ActivitySessionDto,
  type AdminUserDetailDto,
  type CurrentViewDto,
  type OAuthProviderId,
  type OnlineUserDto,
  type PageViewDto,
  type Paginated,
  type TopDocumentDto,
  type TrackedKind,
  type UserEventDto,
  type UserEventType,
  type UserEventsQuery,
  type UserViewsQuery,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import { activitySessions, documents, pageViews, refreshTokens, userEvents, users } from '../../db/schema.js';
import { logActivity } from '../../lib/activity.js';
import { trackEvent } from '../../lib/track.js';
import { isOnline, startOfToday, TZ } from './people.service.js';
import { notFound } from './util.js';

/*
 * What admins see about a person's use of Kaned: online now, when they were
 * last here, how long they stayed and what they looked at. Admins only.
 */

const recent = () => new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000);
const iso = (d: Date) => d.toISOString();
const num = (v: unknown) => Number(v ?? 0);

function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

type ViewRow = typeof pageViews.$inferSelect;

function toView(v: ViewRow): PageViewDto {
  return {
    id: v.id,
    sessionId: v.sessionId,
    path: v.path,
    kind: v.kind as TrackedKind,
    entityId: v.entityId,
    label: v.label ?? v.path,
    startedAt: iso(v.startedAt),
    seconds: v.seconds,
    live: !v.endedAt && v.lastPingAt > recent(),
  };
}

function toCurrent(v: ViewRow | undefined): CurrentViewDto | null {
  if (!v || v.endedAt || v.lastPingAt <= recent()) return null;
  return { path: v.path, kind: v.kind as TrackedKind, entityId: v.entityId, label: v.label ?? v.path, since: iso(v.startedAt) };
}

/** The YYYY-MM-DD of each of the last `days` days in Vietnam time, oldest first. */
function lastDays(days: number) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return Array.from({ length: days }, (_, i) => fmt.format(new Date(Date.now() - (days - 1 - i) * 86_400_000)));
}

/* ─────────────────────────────── one person ─────────────────────────────── */

export async function userDetail(userId: string): Promise<AdminUserDetailDto> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { university: true, major: true, identities: { columns: { provider: true } } },
  });
  if (!user) notFound('Người dùng');

  const [[views], [visits], [events], [uploads], daily, hours, latestView, lastSession] = await Promise.all([
    db
      .select({
        today: sql<number>`coalesce(sum(${pageViews.seconds}) filter (where ${pageViews.startedAt} >= ${startOfToday}), 0)::int`,
        week: sql<number>`coalesce(sum(${pageViews.seconds}) filter (where ${pageViews.startedAt} > now() - interval '7 days'), 0)::int`,
        month: sql<number>`coalesce(sum(${pageViews.seconds}) filter (where ${pageViews.startedAt} > now() - interval '30 days'), 0)::int`,
        all: sql<number>`coalesce(sum(${pageViews.seconds}), 0)::int`,
        docs: sql<number>`count(distinct ${pageViews.entityId}) filter (where ${pageViews.kind} = 'document' and ${pageViews.startedAt} > now() - interval '30 days')::int`,
      })
      .from(pageViews)
      .where(eq(pageViews.userId, userId)),
    db
      .select({
        n: count(),
        avg: sql<number>`coalesce(avg(${activitySessions.activeSeconds}), 0)::int`,
      })
      .from(activitySessions)
      .where(and(eq(activitySessions.userId, userId), sql`${activitySessions.startedAt} > now() - interval '30 days'`)),
    db
      .select({
        downloads: sql<number>`count(*) filter (where ${userEvents.type} = 'download')::int`,
        searches: sql<number>`count(*) filter (where ${userEvents.type} = 'search')::int`,
      })
      .from(userEvents)
      .where(and(eq(userEvents.userId, userId), sql`${userEvents.createdAt} > now() - interval '30 days'`)),
    db.select({ n: count() }).from(documents).where(eq(documents.uploaderId, userId)),
    db
      .select({
        day: sql<string>`to_char(${pageViews.startedAt} at time zone ${sql.raw(`'${TZ}'`)}, 'YYYY-MM-DD')`,
        seconds: sql<number>`sum(${pageViews.seconds})::int`,
      })
      .from(pageViews)
      .where(and(eq(pageViews.userId, userId), sql`${pageViews.startedAt} >= ${startOfToday} - interval '29 days'`))
      .groupBy(sql`1`),
    db
      .select({
        hour: sql<number>`extract(hour from ${pageViews.startedAt} at time zone ${sql.raw(`'${TZ}'`)})::int`,
        seconds: sql<number>`sum(${pageViews.seconds})::int`,
      })
      .from(pageViews)
      .where(and(eq(pageViews.userId, userId), sql`${pageViews.startedAt} > now() - interval '30 days'`))
      .groupBy(sql`1`),
    db.query.pageViews.findFirst({ where: eq(pageViews.userId, userId), orderBy: desc(pageViews.lastPingAt) }),
    db.query.activitySessions.findFirst({ where: eq(activitySessions.userId, userId), orderBy: desc(activitySessions.lastSeenAt) }),
  ]);

  const byDay = new Map(daily.map((d) => [d.day, d.seconds]));
  const byHour = Array.from({ length: 24 }, (_, h) => hours.find((r) => r.hour === h)?.seconds ?? 0);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role,
      year: user.year,
      university: user.university
        ? { id: user.university.id, code: user.university.code, name: user.university.name, color: user.university.color }
        : null,
      major: user.major ? { id: user.major.id, name: user.major.nameVi } : null,
      signInMethods: [
        ...(user.passwordHash ? (['password'] as const) : []),
        ...user.identities.map((i) => i.provider as OAuthProviderId).filter((p) => OAUTH_PROVIDERS.includes(p)),
      ],
      createdAt: iso(user.createdAt),
    },
    stats: {
      online: isOnline(user.lastSeenAt),
      lastSeenAt: user.lastSeenAt ? iso(user.lastSeenAt) : null,
      lastSignInAt: user.lastSignInAt ? iso(user.lastSignInAt) : null,
      activeSecondsToday: num(views?.today),
      activeSeconds7d: num(views?.week),
      activeSeconds30d: num(views?.month),
      activeSecondsAll: num(views?.all),
      sessions30d: num(visits?.n),
      avgSessionSeconds30d: num(visits?.avg),
      documentsViewed30d: num(views?.docs),
      downloads30d: num(events?.downloads),
      searches30d: num(events?.searches),
      uploads: num(uploads?.n),
    },
    daily: lastDays(30).map((date) => ({ date, seconds: byDay.get(date) ?? 0 })),
    hours: byHour,
    current: isOnline(user.lastSeenAt) ? toCurrent(latestView) : null,
    lastDevice: lastSession
      ? { browser: lastSession.browser, os: lastSession.os, device: lastSession.device, ip: lastSession.ip }
      : null,
  };
}

export async function userSessions(userId: string, page: number, pageSize: number): Promise<Paginated<ActivitySessionDto>> {
  const [[total], rows] = await Promise.all([
    db.select({ n: count() }).from(activitySessions).where(eq(activitySessions.userId, userId)),
    db.query.activitySessions.findMany({
      where: eq(activitySessions.userId, userId),
      orderBy: desc(activitySessions.startedAt),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
  ]);
  return paginate(
    rows.map((s) => ({
      id: s.id,
      startedAt: iso(s.startedAt),
      lastSeenAt: iso(s.lastSeenAt),
      activeSeconds: s.activeSeconds,
      pageCount: s.pageCount,
      ip: s.ip,
      browser: s.browser,
      os: s.os,
      device: s.device,
      online: s.lastSeenAt > recent(),
    })),
    num(total?.n),
    page,
    pageSize,
  );
}

export async function sessionViews(sessionId: string): Promise<PageViewDto[]> {
  const rows = await db.query.pageViews.findMany({
    where: eq(pageViews.sessionId, sessionId),
    orderBy: pageViews.startedAt,
    limit: 500,
  });
  return rows.map(toView);
}

export async function userViews(userId: string, query: UserViewsQuery): Promise<Paginated<PageViewDto>> {
  const where = and(eq(pageViews.userId, userId), query.kind ? eq(pageViews.kind, query.kind) : undefined);
  const [[total], rows] = await Promise.all([
    db.select({ n: count() }).from(pageViews).where(where),
    db.query.pageViews.findMany({
      where,
      orderBy: desc(pageViews.startedAt),
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  ]);
  return paginate(rows.map(toView), num(total?.n), query.page, query.pageSize);
}

export async function userTopDocuments(userId: string): Promise<TopDocumentDto[]> {
  const rows = await db
    .select({
      documentId: pageViews.entityId,
      label: sql<string>`max(${pageViews.label})`,
      views: count(),
      seconds: sql<number>`sum(${pageViews.seconds})::int`,
      last: sql<Date>`max(${pageViews.startedAt})`,
    })
    .from(pageViews)
    .where(and(eq(pageViews.userId, userId), eq(pageViews.kind, 'document')))
    .groupBy(pageViews.entityId)
    .orderBy(desc(sql`sum(${pageViews.seconds})`))
    .limit(10);

  const ids = rows.map((r) => r.documentId).filter((id): id is string => Boolean(id));
  const docs = ids.length
    ? await db.query.documents.findMany({
        where: inArray(documents.id, ids),
        columns: { id: true, title: true },
        with: { subject: { columns: { code: true } } },
      })
    : [];
  const byId = new Map(docs.map((d) => [d.id, d]));

  return rows
    .filter((r) => r.documentId)
    .map((r) => ({
      documentId: r.documentId!,
      title: byId.get(r.documentId!)?.title ?? r.label ?? 'Tài liệu đã xoá',
      subjectCode: byId.get(r.documentId!)?.subject?.code ?? null,
      views: num(r.views),
      seconds: num(r.seconds),
      lastViewedAt: new Date(r.last).toISOString(),
    }));
}

export async function userEventList(userId: string, query: UserEventsQuery): Promise<Paginated<UserEventDto>> {
  const where = and(eq(userEvents.userId, userId), query.type ? eq(userEvents.type, query.type) : undefined);
  const [[total], rows] = await Promise.all([
    db.select({ n: count() }).from(userEvents).where(where),
    db.query.userEvents.findMany({
      where,
      orderBy: desc(userEvents.createdAt),
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  ]);
  return paginate(
    rows.map((e) => ({ id: e.id, type: e.type as UserEventType, data: e.data, ip: e.ip, createdAt: iso(e.createdAt) })),
    num(total?.n),
    query.page,
    query.pageSize,
  );
}

/* ────────────────────────────── everyone online ────────────────────────────── */

export async function onlineUsers(): Promise<OnlineUserDto[]> {
  const people = await db.query.users.findMany({
    where: gt(users.lastSeenAt, recent()),
    with: { university: { columns: { code: true, color: true } } },
    orderBy: desc(users.lastSeenAt),
    limit: 100,
  });
  if (!people.length) return [];
  const ids = people.map((p) => p.id);

  const [views, sessions] = await Promise.all([
    db
      .selectDistinctOn([pageViews.userId])
      .from(pageViews)
      .where(and(inArray(pageViews.userId, ids), gt(pageViews.lastPingAt, recent()), isNull(pageViews.endedAt)))
      .orderBy(pageViews.userId, desc(pageViews.lastPingAt)),
    db
      .selectDistinctOn([activitySessions.userId])
      .from(activitySessions)
      .where(inArray(activitySessions.userId, ids))
      .orderBy(activitySessions.userId, desc(activitySessions.lastSeenAt)),
  ]);
  const viewOf = new Map(views.map((v) => [v.userId, v]));
  const sessionOf = new Map(sessions.map((s) => [s.userId, s]));

  return people.map((p) => {
    const s = sessionOf.get(p.id);
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      avatarUrl: p.avatarUrl,
      university: p.university ? { code: p.university.code, color: p.university.color } : null,
      lastSeenAt: iso(p.lastSeenAt!),
      sessionSeconds: s?.activeSeconds ?? 0,
      device: s ? { browser: s.browser, os: s.os, device: s.device } : null,
      current: toCurrent(viewOf.get(p.id)),
    };
  });
}

/* ─────────────────────────────── actions ─────────────────────────────── */

/** Ends every session of the account; open tabs drop out within 15 minutes, when their access token expires. */
export async function signOutEverywhere(actorId: string | undefined, userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, name: true, email: true } });
  if (!user) notFound('Người dùng');
  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  await trackEvent(userId, 'signed_out_by_admin', { sessions: revoked.length });
  await logActivity(actorId, 'update', 'user', userId, `Đăng xuất ${user.name} (${user.email}) khỏi mọi thiết bị`);
  return { revoked: revoked.length };
}
