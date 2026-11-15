import bcrypt from 'bcryptjs';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import type { CurrentUserDto, RegisterInput } from '@kaned/shared';
import { db } from '../../db/index.js';
import { bookmarks, documents, refreshTokens, reviews, users } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { createRefreshToken, hashRefreshToken, signAccessToken } from '../../lib/jwt.js';
import { toCurrentUser, userWith } from '../../lib/dto.js';
import { env } from '../../env.js';

const googleClient = env.googleEnabled ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

async function findUser(userId: string) {
  return db.query.users.findFirst({ where: eq(users.id, userId), with: userWith });
}

async function statsFor(userId: string): Promise<CurrentUserDto['stats']> {
  const [[uploads], [bookmarkCount], [reviewCount], [downloadSum]] = await Promise.all([
    db.select({ value: count() }).from(documents).where(eq(documents.uploaderId, userId)),
    db.select({ value: count() }).from(bookmarks).where(eq(bookmarks.userId, userId)),
    db.select({ value: count() }).from(reviews).where(eq(reviews.userId, userId)),
    db
      .select({ value: sql<number>`coalesce(sum(${documents.downloads}), 0)::int` })
      .from(documents)
      .where(eq(documents.uploaderId, userId)),
  ]);

  return {
    uploads: uploads?.value ?? 0,
    bookmarks: bookmarkCount?.value ?? 0,
    reviews: reviewCount?.value ?? 0,
    downloadsReceived: downloadSum?.value ?? 0,
  };
}

export async function presentUser(userId: string): Promise<CurrentUserDto> {
  const user = await findUser(userId);
  if (!user) throw ApiError.notFound('That account no longer exists.');
  return toCurrentUser(user, await statsFor(userId));
}

export async function issueSession(userId: string, userAgent?: string) {
  const user = await findUser(userId);
  if (!user) throw ApiError.notFound('That account no longer exists.');

  const refresh = createRefreshToken();
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: refresh.hash,
    expiresAt: refresh.expiresAt,
    userAgent: userAgent?.slice(0, 190) ?? null,
  });

  return {
    user: toCurrentUser(user, await statsFor(userId)),
    accessToken: signAccessToken({ sub: user.id, email: user.email, role: user.role }),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

export async function register(input: RegisterInput, userAgent?: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) {
    throw ApiError.conflict('An account with that email already exists.', {
      email: 'This email is already registered. Try signing in instead.',
    });
  }

  const [created] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, 12),
      universityId: input.universityId ?? null,
      majorId: input.majorId ?? null,
      year: input.year ?? null,
    })
    .returning({ id: users.id });

  return issueSession(created.id, userAgent);
}

export async function login(email: string, password: string, userAgent?: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });

  // The same message either way, so the endpoint cannot be used to find out
  // which email addresses have an account.
  const invalid = ApiError.badRequest('That email and password do not match.', {
    password: 'Check your email and password.',
  });

  if (!user?.passwordHash) throw invalid;
  if (!(await bcrypt.compare(password, user.passwordHash))) throw invalid;

  return issueSession(user.id, userAgent);
}

export async function loginWithGoogle(credential: string, userAgent?: string) {
  if (!googleClient) {
    throw ApiError.badRequest(
      'Google sign-in is not configured on this server. Add GOOGLE_CLIENT_ID to apps/api/.env.',
    );
  }

  const ticket = await googleClient
    .verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID })
    .catch(() => null);

  const payload = ticket?.getPayload();
  if (!payload?.email || !payload.sub) {
    throw ApiError.badRequest('Google did not confirm that account. Please try again.');
  }
  if (payload.email_verified === false) {
    throw ApiError.badRequest('That Google account does not have a verified email address.');
  }

  const email = payload.email.toLowerCase();
  const existing = await db.query.users.findFirst({
    where: sql`${users.googleId} = ${payload.sub} or ${users.email} = ${email}`,
  });

  if (existing) {
    // Link the Google identity to an account that started with a password.
    if (!existing.googleId || (!existing.avatarUrl && payload.picture)) {
      await db
        .update(users)
        .set({
          googleId: existing.googleId ?? payload.sub,
          avatarUrl: existing.avatarUrl ?? payload.picture ?? null,
        })
        .where(eq(users.id, existing.id));
    }
    return issueSession(existing.id, userAgent);
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: payload.name?.trim() || email.split('@')[0],
      googleId: payload.sub,
      avatarUrl: payload.picture ?? null,
    })
    .returning({ id: users.id });

  return issueSession(created.id, userAgent);
}

/** How long a just-rotated refresh token still works, for parallel requests. */
const REFRESH_GRACE_MS = 20_000;

export async function refreshSession(token: string | undefined, userAgent?: string) {
  const expired = new ApiError(
    401,
    'REFRESH_INVALID',
    'Your session has expired. Please sign in again.',
  );
  if (!token) throw expired;

  const hash = hashRefreshToken(token);
  const record = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, hash),
  });

  if (!record || record.expiresAt < new Date()) throw expired;

  if (record.revokedAt) {
    // Two tabs can present the same cookie before either stores the new one.
    // Inside a short window that is a race, not a stolen token; after it the
    // session is gone for good.
    const age = Date.now() - record.revokedAt.getTime();
    if (age > REFRESH_GRACE_MS) throw expired;
    return issueSession(record.userId, userAgent);
  }

  // Rotate: the token is spent the moment it is used.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, record.id));

  return issueSession(record.userId, userAgent);
}

export async function revokeSession(token: string | undefined) {
  if (!token) return;
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, hashRefreshToken(token)), isNull(refreshTokens.revokedAt)))
    .catch(() => undefined);
}

export async function currentUser(userId: string): Promise<CurrentUserDto> {
  return presentUser(userId);
}
