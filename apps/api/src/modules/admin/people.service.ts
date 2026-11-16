import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import {
  DOCUMENT_STATUSES,
  OAUTH_PROVIDERS,
  ROLES,
  ROLE_LABELS,
  type ActivityDto,
  type ActivityQuery,
  type AdminOverviewDto,
  type AdminUserDto,
  type AdminUserQuery,
  type DocumentStatus,
  type OAuthProviderId,
  type Paginated,
  type Role,
} from '@kaned/shared';
import { db } from '../../db/index.js';
import {
  academicTerms,
  adminActivity,
  documents,
  faculties,
  majors,
  subjects,
  universities,
  users,
} from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { documentWith } from '../../lib/dto.js';
import { logActivity } from '../../lib/activity.js';
import { toAdminDocument } from './documents.service.js';
import { notFound } from './util.js';

/* ──────────────────────────────── users ───────────────────────────────── */

export async function listUsers(query: AdminUserQuery): Promise<Paginated<AdminUserDto>> {
  const filters: SQL[] = [];
  if (query.role) filters.push(eq(users.role, query.role));
  if (query.universityId) filters.push(eq(users.universityId, query.universityId));
  if (query.q) {
    const q = `%${query.q.trim()}%`;
    const match = or(ilike(users.name, q), ilike(users.email, q));
    if (match) filters.push(match);
  }
  const where = filters.length ? and(...filters) : undefined;

  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(users).where(where),
    db.query.users.findMany({
      where,
      with: { university: true, major: true, identities: { columns: { provider: true } } },
      extras: {
        uploadCount: sql<number>`(select count(*)::int from documents d where d.uploader_id = ${users.id})`.as('upload_count'),
      },
      orderBy: [desc(users.createdAt)],
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  ]);

  return {
    items: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      role: u.role,
      year: u.year,
      university: u.university
        ? { id: u.university.id, code: u.university.code, name: u.university.name, color: u.university.color }
        : null,
      major: u.major ? { id: u.major.id, name: u.major.nameVi } : null,
      uploadCount: Number(u.uploadCount ?? 0),
      signInMethods: [
        ...(u.passwordHash ? (['password'] as const) : []),
        ...u.identities.map((i) => i.provider as OAuthProviderId).filter((p) => OAUTH_PROVIDERS.includes(p)),
      ],
      createdAt: u.createdAt.toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.value ?? 0,
    totalPages: Math.max(1, Math.ceil((total?.value ?? 0) / query.pageSize)),
  };
}

export async function setRole(actorId: string, userId: string, role: Role) {
  if (actorId === userId) {
    throw ApiError.badRequest('Bạn không thể tự đổi quyền của mình — nhờ một quản trị viên khác.');
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) notFound('người dùng');
  if (user.role === 'ADMIN' && role !== 'ADMIN') {
    const [admins] = await db.select({ value: count() }).from(users).where(eq(users.role, 'ADMIN'));
    if ((admins?.value ?? 0) <= 1) throw ApiError.badRequest('Đây là quản trị viên cuối cùng. Cấp quyền cho người khác trước.');
  }
  await db.update(users).set({ role }).where(eq(users.id, userId));
  await logActivity(
    actorId,
    'role',
    'user',
    userId,
    `${user.name}: ${ROLE_LABELS[user.role].vi} → ${ROLE_LABELS[role].vi}`,
  );
  return { id: userId, role };
}

/* ─────────────────────────────── activity ─────────────────────────────── */

export async function listActivity(query: ActivityQuery): Promise<Paginated<ActivityDto>> {
  const where = query.entity ? eq(adminActivity.entity, query.entity) : undefined;
  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(adminActivity).where(where),
    db.query.adminActivity.findMany({
      where,
      with: { actor: true },
      orderBy: desc(adminActivity.createdAt),
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      summary: r.summary,
      createdAt: r.createdAt.toISOString(),
      actor: r.actor ? { id: r.actor.id, name: r.actor.name, avatarUrl: r.actor.avatarUrl } : null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.value ?? 0,
    totalPages: Math.max(1, Math.ceil((total?.value ?? 0) / query.pageSize)),
  };
}

/* ─────────────────────────────── overview ─────────────────────────────── */

async function countOf(from: typeof universities | typeof faculties | typeof majors | typeof subjects | typeof academicTerms | typeof documents | typeof users) {
  const [row] = await db.select({ value: count() }).from(from);
  return row?.value ?? 0;
}

export async function overview(): Promise<AdminOverviewDto> {
  const weeks = 8;
  const [u, f, m, s, t, d, us, byStatus, byRole, weekly, top, pending, activity] = await Promise.all([
    countOf(universities),
    countOf(faculties),
    countOf(majors),
    countOf(subjects),
    countOf(academicTerms),
    countOf(documents),
    countOf(users),
    db.select({ key: documents.status, value: count() }).from(documents).groupBy(documents.status),
    db.select({ key: users.role, value: count() }).from(users).groupBy(users.role),
    db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${documents.createdAt}), 'YYYY-MM-DD')`,
        value: count(),
      })
      .from(documents)
      .where(sql`${documents.createdAt} >= date_trunc('week', now()) - interval '${sql.raw(String(weeks - 1))} weeks'`)
      .groupBy(sql`1`),
    db
      .select({
        id: universities.id,
        code: universities.code,
        name: universities.nameVi,
        color: universities.color,
        documents: count(documents.id),
      })
      .from(universities)
      .leftJoin(documents, eq(documents.universityId, universities.id))
      .groupBy(universities.id)
      .orderBy(desc(count(documents.id)))
      .limit(6),
    db.query.documents.findMany({
      where: eq(documents.status, 'PENDING'),
      with: documentWith,
      orderBy: desc(documents.createdAt),
      limit: 5,
    }),
    listActivity({ page: 1, pageSize: 8 }),
  ]);

  const documentsByStatus = Object.fromEntries(DOCUMENT_STATUSES.map((k) => [k, 0])) as Record<DocumentStatus, number>;
  for (const r of byStatus) documentsByStatus[r.key] = r.value;
  const usersByRole = Object.fromEntries(ROLES.map((k) => [k, 0])) as Record<Role, number>;
  for (const r of byRole) usersByRole[r.key] = r.value;

  // Monday of each of the last `weeks` weeks, oldest first, zero-filled.
  const counts = new Map(weekly.map((w) => [w.week, w.value]));
  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const uploadsByWeek = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() - (weeks - 1 - i) * 7);
    const key = d.toISOString().slice(0, 10);
    return { weekStart: key, count: counts.get(key) ?? 0 };
  });

  return {
    counts: { universities: u, faculties: f, majors: m, subjects: s, terms: t, documents: d, users: us },
    documentsByStatus,
    usersByRole,
    uploadsByWeek,
    topUniversities: top,
    pending: pending.map(toAdminDocument),
    recentActivity: activity.items,
  };
}
