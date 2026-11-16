import type { Request } from 'express';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { UserEventType } from '@kaned/shared';
import { db } from '../db/index.js';
import { userEvents, users } from '../db/schema.js';

export function clientIp(req?: Request) {
  return req?.ip?.replace(/^::ffff:/, '').slice(0, 64) ?? null;
}

/**
 * Adds a line to a person's history (see USER_EVENT_TYPES). Never throws:
 * a history write must not break the action it describes.
 */
export async function trackEvent(
  userId: string | null | undefined,
  type: UserEventType,
  data: Record<string, unknown> = {},
  req?: Request,
) {
  if (!userId) return;
  try {
    if (type === 'search') {
      // Typing "c", "cs", "csd201" fires three searches; keep the last one.
      const q = String(data.q ?? '').trim();
      if (!q) return;
      const recent = await db.query.userEvents.findFirst({
        where: and(eq(userEvents.userId, userId), eq(userEvents.type, 'search'), gt(userEvents.createdAt, new Date(Date.now() - 30_000))),
        orderBy: desc(userEvents.createdAt),
      });
      const prev = String(recent?.data?.q ?? '').toLowerCase();
      const now = q.toLowerCase();
      if (recent && (now.startsWith(prev) || prev.startsWith(now))) {
        await db.update(userEvents).set({ data: { ...data, q }, createdAt: new Date() }).where(eq(userEvents.id, recent.id));
        return;
      }
      data = { ...data, q };
    }

    await db.insert(userEvents).values({ userId, type, data, ip: clientIp(req) });
    if (type === 'sign_in' || type === 'sign_up') {
      await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, userId));
    }
  } catch (error) {
    console.warn(`  [track] ${type}: ${(error as Error).message}`);
  }
}
