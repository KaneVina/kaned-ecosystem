import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { vecAttempts, vecJoinAttempts, vecSessions } from '../../db/schema.js';
import { settleSession } from './vec.engine.js';
import { purgeSessionFiles, sweepOrphanFiles } from './vec.pe.js';

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
  // Practical rooms hold files: remove those before the rows that point at them.
  const dueFiles = await db.select({ id: vecSessions.id }).from(vecSessions).where(and(lt(vecSessions.expiresAt, new Date()), eq(vecSessions.kind, 'PE'))).limit(50);
  let files = 0;
  for (const { id } of dueFiles) files += await purgeSessionFiles(id).catch(() => 0);
  const expired = await db.delete(vecSessions).where(and(lt(vecSessions.expiresAt, new Date()))).returning({ id: vecSessions.id });
  files += await sweepOrphanFiles().catch(() => 0);
  await db.delete(vecJoinAttempts).where(lt(vecJoinAttempts.createdAt, new Date(Date.now() - 24 * 3600_000)));
  return { settled, purged: expired.length, files };
}
