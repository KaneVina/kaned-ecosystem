/**
 * Removes the public demo student (ngoc.tb@fpt.edu.vn / kaned2026). Its
 * documents are handed to admin@kaned.vn so the library keeps them.
 *   npm run db:remove-demo
 */
import { eq } from 'drizzle-orm';
import { db, sqlClient } from './index.js';
import { documents, users } from './schema.js';

const demo = await db.query.users.findFirst({ where: eq(users.email, 'ngoc.tb@fpt.edu.vn') });
const admin = await db.query.users.findFirst({ where: eq(users.email, 'admin@kaned.vn') });
if (!demo) console.log('Demo account already removed.');
else {
  if (admin) await db.update(documents).set({ uploaderId: admin.id }).where(eq(documents.uploaderId, demo.id));
  await db.delete(users).where(eq(users.id, demo.id));
  console.log('Demo account ngoc.tb@fpt.edu.vn removed; its documents now belong to admin@kaned.vn.');
}
await sqlClient.end({ timeout: 5 });
