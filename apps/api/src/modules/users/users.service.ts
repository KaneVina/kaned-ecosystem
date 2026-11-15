import { and, count, eq, sql } from 'drizzle-orm';
import type { CurrentUserDto, UpdateProfileInput } from '@kaned/shared';
import { db } from '../../db/index.js';
import { documents, majors, users } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { presentUser } from '../auth/auth.service.js';
import { toUserSummary, userWith } from '../../lib/dto.js';

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<CurrentUserDto> {
  let universityId = input.universityId ?? undefined;

  if (input.majorId) {
    const major = await db.query.majors.findFirst({
      where: eq(majors.id, input.majorId),
      with: { faculty: true },
    });
    if (!major) {
      throw ApiError.badRequest('That major does not exist.', { majorId: 'Unknown major.' });
    }
    // Keep the profile consistent: the university always follows the major.
    universityId = major.faculty.universityId;
  }

  await db
    .update(users)
    .set({
      name: input.name,
      bio: input.bio ?? undefined,
      universityId,
      majorId: input.majorId ?? undefined,
      year: input.year ?? undefined,
    })
    .where(eq(users.id, userId));

  return presentUser(userId);
}

export async function getPublicProfile(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), with: userWith });
  if (!user) throw ApiError.notFound('We could not find that profile.');

  const [stats] = await db
    .select({
      uploads: count(),
      downloads: sql<number>`coalesce(sum(${documents.downloads}), 0)::int`,
      rating: sql<number>`coalesce(avg(nullif(${documents.ratingAvg}, 0)), 0)::float8`,
    })
    .from(documents)
    .where(and(eq(documents.uploaderId, userId), eq(documents.status, 'PUBLISHED')));

  return {
    ...toUserSummary(user, stats?.uploads ?? 0),
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
    downloadsReceived: stats?.downloads ?? 0,
    averageRating: Number((stats?.rating ?? 0).toFixed(2)),
  };
}
