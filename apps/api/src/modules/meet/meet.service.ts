import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import {
  MEET_MAX_PARTICIPANTS,
  MEET_RETENTION_DAYS,
  cleanSlots,
  countSlots,
  foldVi,
  validMeetRange,
  type MeetEventDto,
  type MeetListItem,
  type MeetParticipantDto,
  type MeetSlots,
  type MeetStateDto,
  type meetAvailabilitySchema,
  type meetEventInputSchema,
  type meetFinalSchema,
} from '@kaned/shared';
import type { z } from 'zod';
import { db } from '../../db/index.js';
import { meetEvents, meetParticipants, users } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';

type EventInput = z.output<typeof meetEventInputSchema>;
type EventRow = typeof meetEvents.$inferSelect;
type PartRow = typeof meetParticipants.$inferSelect;

const RETAIN_MS = MEET_RETENTION_DAYS * 24 * 3600_000;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ABC = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 10 characters from 56: about 58 bits, unguessable, short enough to read out. */
const newSlug = () => [...randomBytes(10)].map((b) => ABC[b % ABC.length]).join('');
const newToken = () => randomBytes(24).toString('base64url');
const nameKey = (n: string) => foldVi(n).replace(/\s+/g, ' ').trim().slice(0, 60);
const pinHash = (participantId: string, pin: string) => sha(`meet-pin:${participantId}:${pin}`);
const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

function eventDto(e: EventRow, ownerName: string): MeetEventDto {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    description: e.description,
    location: e.location,
    mode: e.mode as MeetEventDto['mode'],
    days: e.days,
    slotMin: e.slotMin,
    durationMin: e.durationMin,
    blocked: e.blocked ?? {},
    blockedLabel: e.blockedLabel,
    status: e.status as MeetEventDto['status'],
    final: e.final ?? null,
    ownerName,
    version: e.version,
    createdAt: e.createdAt.getTime(),
    updatedAt: e.updatedAt.getTime(),
    expiresAt: e.expiresAt.getTime(),
  };
}

const partDto = (p: PartRow, ownerId: string): MeetParticipantDto => ({
  id: p.id,
  name: p.name,
  free: p.free ?? {},
  busy: p.busy ?? {},
  busyNote: p.busyNote,
  isOwner: Boolean(p.userId && p.userId === ownerId),
  savedAt: ms(p.savedAt),
  joinedAt: p.createdAt.getTime(),
});

/** Any change: bump the version (open pages refresh) and push the expiry back. */
async function touch(eventId: string) {
  await db
    .update(meetEvents)
    .set({ version: sql`${meetEvents.version} + 1`, updatedAt: new Date(), expiresAt: new Date(Date.now() + RETAIN_MS) })
    .where(eq(meetEvents.id, eventId));
}

async function ownerName(id: string) {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  return u?.name ?? 'Trưởng nhóm';
}

/* ─────────────────────────── the leader ─────────────────────────── */

function normalise(input: EventInput) {
  const blocked = cleanSlots(input.blocked ?? {}, input.days, input.slotMin);
  return { ...input, blocked };
}

export async function createEvent(userId: string, input: EventInput): Promise<MeetEventDto> {
  void sweep();
  const v = normalise(input);
  for (let tries = 0; tries < 5; tries++) {
    try {
      const [row] = await db
        .insert(meetEvents)
        .values({
          slug: newSlug(),
          ownerId: userId,
          title: v.title,
          description: v.description,
          location: v.location,
          mode: v.mode,
          days: v.days,
          slotMin: v.slotMin,
          durationMin: v.durationMin,
          blocked: v.blocked,
          blockedLabel: v.blockedLabel || 'Lịch học',
          expiresAt: new Date(Date.now() + RETAIN_MS),
        })
        .returning();
      return eventDto(row!, await ownerName(userId));
    } catch (e) {
      if (!/meet_events_slug_idx/.test(String((e as Error).message))) throw e;
    }
  }
  throw ApiError.conflict('Không tạo được đường dẫn, thử lại.');
}

async function ownEvent(id: string, userId: string, role: string) {
  const [e] = await db.select().from(meetEvents).where(eq(meetEvents.id, id)).limit(1);
  if (!e) throw ApiError.notFound('Không tìm thấy sự kiện.');
  if (e.ownerId !== userId && role !== 'ADMIN') throw ApiError.forbidden('Chỉ trưởng nhóm làm được việc này.');
  return e;
}

export async function getOwn(id: string, userId: string, role: string): Promise<MeetEventDto> {
  const e = await ownEvent(id, userId, role);
  return eventDto(e, await ownerName(e.ownerId));
}

export async function updateEvent(id: string, userId: string, role: string, input: EventInput): Promise<MeetEventDto> {
  const e = await ownEvent(id, userId, role);
  const v = normalise(input);
  const final = e.final && validMeetRange(v, e.final.day, e.final.start, e.final.end) ? e.final : null;
  const [row] = await db
    .update(meetEvents)
    .set({
      title: v.title,
      description: v.description,
      location: v.location,
      mode: v.mode,
      days: v.days,
      slotMin: v.slotMin,
      durationMin: v.durationMin,
      blocked: v.blocked,
      blockedLabel: v.blockedLabel || 'Lịch học',
      final,
      status: final ? e.status : 'OPEN',
      version: sql`${meetEvents.version} + 1`,
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + RETAIN_MS),
    })
    .where(eq(meetEvents.id, e.id))
    .returning();
  // A different grid (mode or slot size) makes old answers meaningless.
  if (v.mode !== e.mode || v.slotMin !== e.slotMin) await db.update(meetParticipants).set({ free: {}, busy: {}, savedAt: null }).where(eq(meetParticipants.eventId, e.id));
  return eventDto(row!, await ownerName(row!.ownerId));
}

export async function deleteEvent(id: string, userId: string, role: string) {
  const e = await ownEvent(id, userId, role);
  await db.delete(meetEvents).where(eq(meetEvents.id, e.id));
  return { ok: true };
}

export async function finalize(id: string, userId: string, role: string, body: z.output<typeof meetFinalSchema>) {
  const e = await ownEvent(id, userId, role);
  if (!validMeetRange(e, body.day, body.start, body.end)) throw ApiError.badRequest('Khung giờ này không nằm trong lịch của sự kiện.');
  await db.update(meetEvents).set({ status: 'FINAL', final: { day: body.day, start: body.start, end: body.end, note: body.note ?? '', at: Date.now() } }).where(eq(meetEvents.id, e.id));
  await touch(e.id);
  return { ok: true };
}

export async function reopen(id: string, userId: string, role: string) {
  const e = await ownEvent(id, userId, role);
  await db.update(meetEvents).set({ status: 'OPEN', final: null }).where(eq(meetEvents.id, e.id));
  await touch(e.id);
  return { ok: true };
}

export async function removeParticipant(id: string, pid: string, userId: string, role: string) {
  const e = await ownEvent(id, userId, role);
  await db.delete(meetParticipants).where(and(eq(meetParticipants.id, pid), eq(meetParticipants.eventId, e.id)));
  await touch(e.id);
  return { ok: true };
}

export async function listMine(userId: string): Promise<MeetListItem[]> {
  void sweep();
  const rows = await db
    .select({
      e: meetEvents,
      participants: sql<number>`(select count(*)::int from ${meetParticipants} p where p.event_id = "meet_events"."id")`,
      responded: sql<number>`(select count(*)::int from ${meetParticipants} p where p.event_id = "meet_events"."id" and p.saved_at is not null)`,
    })
    .from(meetEvents)
    .where(eq(meetEvents.ownerId, userId))
    .orderBy(desc(meetEvents.updatedAt))
    .limit(100);
  return rows.map(({ e, participants, responded }) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    status: e.status as MeetListItem['status'],
    mode: e.mode as MeetListItem['mode'],
    days: e.days,
    durationMin: e.durationMin,
    final: e.final ?? null,
    participants: Number(participants),
    responded: Number(responded),
    updatedAt: e.updatedAt.getTime(),
    expiresAt: e.expiresAt.getTime(),
  }));
}

/* ─────────────────────────── everyone with the link ─────────────────────────── */

async function bySlug(slug: string) {
  const [e] = await db.select().from(meetEvents).where(eq(meetEvents.slug, slug)).limit(1);
  if (!e || e.expiresAt.getTime() < Date.now()) throw ApiError.notFound('Sự kiện không tồn tại hoặc đã hết hạn.');
  return e;
}

/** Once the leader has picked the time, answers are frozen until they reopen it. */
function assertOpen(e: EventRow) {
  if (e.status === 'FINAL') throw new ApiError(409, 'MEET_FINAL', 'Trưởng nhóm đã chốt giờ họp nên lịch đã khoá. Nhờ trưởng nhóm mở lại nếu cần đổi.');
}

/** Who is asking: their browser's token, or their Kaned account. */
async function whoIs(e: EventRow, token?: string, userId?: string): Promise<PartRow | null> {
  if (token) {
    const [p] = await db.select().from(meetParticipants).where(and(eq(meetParticipants.eventId, e.id), eq(meetParticipants.tokenHash, sha(token)))).limit(1);
    if (p) return p;
  }
  if (userId) {
    const [p] = await db.select().from(meetParticipants).where(and(eq(meetParticipants.eventId, e.id), eq(meetParticipants.userId, userId))).limit(1);
    if (p) return p;
  }
  return null;
}

async function stateOf(e: EventRow, me: PartRow | null, userId?: string): Promise<MeetStateDto> {
  const parts = await db.select().from(meetParticipants).where(eq(meetParticipants.eventId, e.id)).orderBy(meetParticipants.createdAt);
  return {
    event: eventDto(e, await ownerName(e.ownerId)),
    participants: parts.map((p) => partDto(p, e.ownerId)),
    me: me ? { id: me.id, name: me.name, hasPin: Boolean(me.pinHash) } : null,
    isOwner: Boolean(userId && userId === e.ownerId),
  };
}

export async function publicState(slug: string, token?: string, userId?: string) {
  const e = await bySlug(slug);
  return stateOf(e, await whoIs(e, token, userId), userId);
}

/** Cheap check for open pages: the full state only when something changed. */
export async function poll(slug: string, version: number, token?: string, userId?: string) {
  const [row] = await db.select({ id: meetEvents.id, v: meetEvents.version, exp: meetEvents.expiresAt }).from(meetEvents).where(eq(meetEvents.slug, slug)).limit(1);
  if (!row || row.exp.getTime() < Date.now()) throw ApiError.notFound('Sự kiện không tồn tại hoặc đã hết hạn.');
  if (row.v === version) return { changed: false as const, v: row.v };
  return { changed: true as const, v: row.v, state: await publicState(slug, token, userId) };
}

export async function join(slug: string, body: { name: string; pin?: string }, userId?: string) {
  const e = await bySlug(slug);
  const key = nameKey(body.name);
  if (!key) throw ApiError.badRequest('Nhập tên của bạn.');
  const token = newToken();
  const [same] = await db.select().from(meetParticipants).where(and(eq(meetParticipants.eventId, e.id), eq(meetParticipants.nameKey, key))).limit(1);
  if (same) {
    // Coming back on another device: the same account, or the PIN they set.
    const okUser = Boolean(userId && same.userId === userId);
    const okPin = Boolean(same.pinHash && body.pin && timingSafeEqual(Buffer.from(same.pinHash), Buffer.from(pinHash(same.id, body.pin))));
    if (!okUser && !okPin) {
      if (same.pinHash) throw new ApiError(409, body.pin ? 'PIN_WRONG' : 'PIN_REQUIRED', body.pin ? 'Mã PIN không đúng.' : 'Tên này đã có người dùng. Nếu là bạn, nhập mã PIN đã đặt.');
      throw new ApiError(409, 'NAME_TAKEN', 'Tên này đã có người dùng. Thêm chữ cái hoặc biệt danh để phân biệt, ví dụ "Nam K."');
    }
    await db.update(meetParticipants).set({ tokenHash: sha(token), userId: same.userId ?? userId ?? null, updatedAt: new Date() }).where(eq(meetParticipants.id, same.id));
    return { token, state: await publicState(slug, token, userId) };
  }
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(meetParticipants).where(eq(meetParticipants.eventId, e.id))) as [{ n: number }];
  if (n >= MEET_MAX_PARTICIPANTS) throw ApiError.conflict('Sự kiện đã đủ người tham gia.');
  // One account, one answer: a signed-in person who already answered gets their own row back.
  if (userId) {
    const [mine] = await db.select().from(meetParticipants).where(and(eq(meetParticipants.eventId, e.id), eq(meetParticipants.userId, userId))).limit(1);
    if (mine) {
      await db.update(meetParticipants).set({ name: body.name.trim(), nameKey: key, tokenHash: sha(token) }).where(eq(meetParticipants.id, mine.id));
      await touch(e.id);
      return { token, state: await publicState(slug, token, userId) };
    }
  }
  // Coming back is fine; a new answer after the final time is not.
  assertOpen(e);
  const [row] = await db
    .insert(meetParticipants)
    .values({ eventId: e.id, name: body.name.trim(), nameKey: key, tokenHash: sha(token), userId: userId ?? null })
    .returning({ id: meetParticipants.id });
  if (body.pin) await db.update(meetParticipants).set({ pinHash: pinHash(row!.id, body.pin) }).where(eq(meetParticipants.id, row!.id));
  await touch(e.id);
  return { token, state: await publicState(slug, token, userId) };
}

export async function saveMine(slug: string, body: z.output<typeof meetAvailabilitySchema>, token?: string, userId?: string) {
  const e = await bySlug(slug);
  const me = await whoIs(e, token, userId);
  if (!me) throw new ApiError(403, 'MEET_NOT_JOINED', 'Nhập tên trước khi lưu lịch.');
  assertOpen(e);
  const free = cleanSlots(body.free as MeetSlots, e.days, e.slotMin, e.blocked);
  const busy = cleanSlots(body.busy as MeetSlots, e.days, e.slotMin, e.blocked);
  // A slot is either free or busy, never both: busy wins (it is the stronger statement).
  for (const [d, list] of Object.entries(busy)) {
    const b = new Set(list);
    if (free[d]) free[d] = free[d]!.filter((m) => !b.has(m));
    if (free[d] && !free[d]!.length) delete free[d];
  }
  await db
    .update(meetParticipants)
    .set({ free, busy, busyNote: body.busyNote ?? '', savedAt: countSlots(free) || countSlots(busy) ? new Date() : null, updatedAt: new Date() })
    .where(eq(meetParticipants.id, me.id));
  await touch(e.id);
  return publicState(slug, token, userId);
}

export async function setPin(slug: string, pin: string, token?: string, userId?: string) {
  const e = await bySlug(slug);
  const me = await whoIs(e, token, userId);
  if (!me) throw new ApiError(403, 'MEET_NOT_JOINED', 'Nhập tên trước.');
  await db.update(meetParticipants).set({ pinHash: pinHash(me.id, pin) }).where(eq(meetParticipants.id, me.id));
  return { ok: true };
}

export async function leave(slug: string, token?: string, userId?: string) {
  const e = await bySlug(slug);
  const me = await whoIs(e, token, userId);
  if (!me) return { ok: true };
  assertOpen(e);
  await db.delete(meetParticipants).where(eq(meetParticipants.id, me.id));
  await touch(e.id);
  return { ok: true };
}

/* ─────────────────────────── clean-up ─────────────────────────── */

let lastSweep = 0;
/** Events nobody touched for 60 days go, with their answers. At most every ten minutes. */
export async function sweep() {
  if (Date.now() - lastSweep < 10 * 60_000) return;
  lastSweep = Date.now();
  try {
    await db.delete(meetEvents).where(lt(meetEvents.expiresAt, new Date()));
  } catch (e) {
    console.error('[meet] sweep failed', e);
  }
}
