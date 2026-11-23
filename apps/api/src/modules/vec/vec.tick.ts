import { and, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { vecAttempts, vecJoinAttempts, vecSessions } from '../../db/schema.js';
import { settleSession } from './vec.engine.js';

/**
 * Optional heartbeat for the whole system. Everything it does also happens
 * lazily whenever someone opens a session, so a missed tick only delays
 * grading of rooms nobody is looking at.
 */
export async function tick() {
  const ids = await db
    .selectDistinct({ sid: vecAttempts.sessionId })
    .from(vecAttempts)
    .where(inArray(vecAttempts.state, ['LOBBY', 'IN_PROGRESS', 'SUSPENDED']))
    .limit(300);
  let settled = 0;
  for (const { sid } of ids) {
    const [s] = await db.select().from(vecSessions).where(sql`${vecSessions.id} = ${sid}`).limit(1);
    if (!s) continue;
    await settleSession(s).catch((e) => console.error('[vec] settle failed', sid, e));
    settled++;
  }
  const expired = await db.delete(vecSessions).where(and(lt(vecSessions.expiresAt, new Date()))).returning({ id: vecSessions.id });
  await db.delete(vecJoinAttempts).where(lt(vecJoinAttempts.createdAt, new Date(Date.now() - 24 * 3600_000)));
  return { settled, purged: expired.length };
}
