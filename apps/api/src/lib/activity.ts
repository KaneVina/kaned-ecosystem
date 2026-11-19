import { db } from '../db/index.js';
import { adminActivity } from '../db/schema.js';

export type ActivityAction = 'create' | 'update' | 'delete' | 'publish' | 'reject' | 'remove' | 'role' | 'move';
export type ActivityEntity =
  | 'university'
  | 'faculty'
  | 'major'
  | 'term'
  | 'subject'
  | 'curriculum'
  | 'document'
  | 'folder'
  | 'deck'
  | 'lecturer'
  | 'user';

/** Records what an admin did. Never fails the request it describes. */
export async function logActivity(
  actorId: string | undefined,
  action: ActivityAction,
  entity: ActivityEntity,
  entityId: string | null,
  summary: string,
) {
  await db
    .insert(adminActivity)
    .values({ actorId: actorId ?? null, action, entity, entityId, summary })
    .catch((error) => console.error('[activity] could not record', error));
}
