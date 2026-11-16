import { randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, ne } from 'drizzle-orm';
import {
  OAUTH_PROVIDER_LABELS,
  safeNextPath,
  type AccountSecurityDto,
  type AuthConfigDto,
  type OAuthErrorCode,
  type OAuthIntent,
  type OAuthProviderId,
} from '@kaned/shared';
import { db } from '../../../db/index.js';
import { refreshTokens, userIdentities, users } from '../../../db/schema.js';
import { env } from '../../../env.js';
import { ApiError } from '../../../lib/errors.js';
import { hashRefreshToken } from '../../../lib/jwt.js';
import { seal, unseal } from '../../../lib/seal.js';
import {
  authorizeUrl,
  configuredProviders,
  exchangeCode,
  fetchProfile,
  getProvider,
  ProviderError,
  type OAuthProfile,
} from './providers.js';

/*
 * Sign-in with an outside account, as a server-side authorization code flow:
 *
 *   browser → GET /api/auth/oauth/:provider/start
 *             state, PKCE verifier and nonce go into an encrypted cookie
 *           → provider's consent screen
 *           → GET /api/auth/oauth/:provider/callback?code&state
 *             state checked against the cookie, code swapped for tokens,
 *             account found / linked / created, refresh cookie set
 *           → WEB_URL/auth/callback?… and the web app picks up the session
 *
 * The browser never sees a provider token, and every way back to the web app
 * goes to WEB_URL from the environment, never to an address from the request.
 */

export const STATE_COOKIE = 'kaned_oauth';
export const STATE_COOKIE_PATH = '/api/auth/oauth';
export const STATE_TTL_MS = 10 * 60 * 1000;
const LINK_TICKET_TTL_MS = 2 * 60 * 1000;

interface FlowState {
  provider: OAuthProviderId;
  state: string;
  verifier: string;
  nonce: string;
  next: string;
  intent: OAuthIntent;
  /** The signed-in account, when linking. */
  userId?: string;
}

class FlowError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    readonly hint?: string,
  ) {
    super(code);
  }
}

const random = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function callbackUrl(provider: OAuthProviderId) {
  return `${env.apiPublicUrl}/api/auth/oauth/${provider}/callback`;
}

export function startUrl(provider: OAuthProviderId) {
  return `${env.apiPublicUrl}/api/auth/oauth/${provider}/start`;
}

/** Where the browser lands in the web app when the round trip is over. */
function webReturn(params: Record<string, string | undefined>) {
  const url = new URL(`${env.webUrl}/auth/callback`);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

/** "ngoc.tb@fpt.edu.vn" → "n•••b@fpt.edu.vn": enough to recognise, not to harvest. */
function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  const shown = local.length <= 2 ? local[0] : `${local[0]}•••${local[local.length - 1]}`;
  return `${shown}@${domain}`;
}

export function authConfig(): AuthConfigDto {
  return {
    providers: configuredProviders().map((p) => ({ ...p, startUrl: startUrl(p.id) })),
    showSetupHint: !env.isProd,
  };
}

/* ─────────────────────────────── start ─────────────────────────────── */

export interface StartResult {
  redirect: string;
  /** Sealed flow state for the cookie; absent when the flow ended before leaving. */
  cookie?: string;
}

export function startFlow(
  providerId: string,
  query: { next?: unknown; intent?: unknown; ticket?: unknown },
): StartResult {
  const intent: OAuthIntent = query.intent === 'link' ? 'link' : 'login';
  const next = safeNextPath(query.next, intent === 'link' ? '/app/settings' : '/app');
  const provider = OAUTH_PROVIDER_LABELS[providerId as OAuthProviderId] ? (providerId as OAuthProviderId) : undefined;
  const def = provider ? getProvider(provider) : null;
  if (!provider || !def) return { redirect: webReturn({ error: 'not_configured', provider, intent, next }) };

  let userId: string | undefined;
  if (intent === 'link') {
    const ticket = unseal<{ userId: string; provider: string }>('link-ticket', typeof query.ticket === 'string' ? query.ticket : null);
    if (!ticket || ticket.provider !== provider) {
      return { redirect: webReturn({ error: 'session_required', provider, intent, next }) };
    }
    userId = ticket.userId;
  }

  const flow: FlowState = { provider, state: random(), verifier: random(48), nonce: random(), next, intent, userId };
  return {
    redirect: authorizeUrl(def, { ...flow, redirectUri: callbackUrl(provider) }),
    cookie: seal('oauth-state', flow, STATE_TTL_MS),
  };
}

/** A short-lived ticket that lets the signed-in person start linking with a plain page load. */
export function linkTicketUrl(userId: string, providerId: string, next?: unknown) {
  const def = getProvider(providerId);
  if (!def) throw ApiError.badRequest(`${OAUTH_PROVIDER_LABELS[providerId as OAuthProviderId] ?? providerId} chưa được bật trên máy chủ này.`);
  const ticket = seal('link-ticket', { userId, provider: def.id }, LINK_TICKET_TTL_MS);
  const url = new URL(startUrl(def.id));
  url.searchParams.set('intent', 'link');
  url.searchParams.set('ticket', ticket);
  url.searchParams.set('next', safeNextPath(next, '/app/settings'));
  return url.toString();
}

/* ────────────────────────────── callback ───────────────────────────── */

export interface CallbackResult {
  redirect: string;
  /** Present when the person is now signed in and needs a session. */
  signInUserId?: string;
}

function sameState(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function completeFlow(
  providerId: string,
  query: Record<string, unknown>,
  cookie: string | undefined,
): Promise<CallbackResult> {
  const flow = unseal<FlowState>('oauth-state', cookie);
  const provider = (flow?.provider ?? (OAUTH_PROVIDER_LABELS[providerId as OAuthProviderId] ? providerId : undefined)) as
    | OAuthProviderId
    | undefined;
  const intent = flow?.intent ?? 'login';
  const next = flow?.next ?? '/app';
  const fail = (code: OAuthErrorCode, hint?: string): CallbackResult => ({
    redirect: webReturn({ error: code, provider, intent, next, hint }),
  });

  const state = typeof query.state === 'string' ? query.state : '';
  if (!flow || flow.provider !== providerId || !state || !sameState(state, flow.state)) return fail('expired');

  // The person backed out on the provider's screen.
  if (typeof query.error === 'string') {
    return fail(query.error === 'access_denied' || query.error === 'consent_required' ? 'cancelled' : 'provider_error');
  }

  const code = typeof query.code === 'string' ? query.code : '';
  const def = getProvider(flow.provider);
  if (!def) return fail('not_configured');
  if (!code) return fail('provider_error');

  let profile: OAuthProfile;
  try {
    const tokens = await exchangeCode(def, code, flow.verifier, callbackUrl(flow.provider));
    profile = await fetchProfile(def, tokens, flow.nonce);
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    console.warn(`  [oauth] ${flow.provider}: ${error.message}`);
    return fail('provider_error');
  }

  try {
    if (flow.intent === 'link') {
      await linkIdentity(flow.userId ?? '', flow.provider, profile);
      return { redirect: webReturn({ linked: flow.provider, provider: flow.provider, intent: 'link', next }) };
    }
    const { userId, created } = await signIn(flow.provider, profile);
    return {
      redirect: webReturn({ provider: flow.provider, intent: 'login', next, new: created ? '1' : undefined }),
      signInUserId: userId,
    };
  } catch (error) {
    if (error instanceof FlowError) return fail(error.code, error.hint);
    throw error;
  }
}

/* ───────────────────────────── accounts ────────────────────────────── */

async function touchIdentity(id: string, profile: OAuthProfile) {
  await db
    .update(userIdentities)
    .set({ email: profile.email, emailVerified: profile.emailVerified, lastUsedAt: new Date() })
    .where(eq(userIdentities.id, id));
}

async function fillAvatar(userId: string, avatarUrl: string | null) {
  if (!avatarUrl) return;
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { avatarUrl: true } });
  if (user && !user.avatarUrl) await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
}

async function findIdentity(provider: OAuthProviderId, providerUserId: string) {
  return db.query.userIdentities.findFirst({
    where: and(eq(userIdentities.provider, provider), eq(userIdentities.providerUserId, providerUserId)),
  });
}

/**
 * Who is signing in:
 *   1. this provider account is already linked     → that Kaned account
 *   2. its verified email matches a Kaned account  → link it, then sign in
 *   3. the email matches but is not verified       → refuse: sign in the old
 *      way and link from settings (stops account takeover through a provider
 *      that lets anyone claim any address)
 *   4. nobody has the email                        → new account
 */
async function signIn(provider: OAuthProviderId, profile: OAuthProfile): Promise<{ userId: string; created: boolean }> {
  const known = await findIdentity(provider, profile.id);
  if (known) {
    await touchIdentity(known.id, profile);
    await fillAvatar(known.userId, profile.avatarUrl);
    return { userId: known.userId, created: false };
  }

  if (!profile.email) throw new FlowError('email_missing');
  const email = profile.email.toLowerCase();

  const existing = await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
  if (existing) {
    if (!profile.emailVerified) throw new FlowError('link_required', maskEmail(email));
    const other = await db.query.userIdentities.findFirst({
      where: and(eq(userIdentities.userId, existing.id), eq(userIdentities.provider, provider)),
    });
    if (other) throw new FlowError('provider_already_linked');
    await db.insert(userIdentities).values({
      userId: existing.id,
      provider,
      providerUserId: profile.id,
      email,
      emailVerified: true,
      lastUsedAt: new Date(),
    });
    await fillAvatar(existing.id, profile.avatarUrl);
    return { userId: existing.id, created: false };
  }

  const userId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email, name: profile.name?.slice(0, 80) || email.split('@')[0], avatarUrl: profile.avatarUrl })
      .returning({ id: users.id });
    await tx.insert(userIdentities).values({
      userId: created.id,
      provider,
      providerUserId: profile.id,
      email,
      emailVerified: profile.emailVerified,
      lastUsedAt: new Date(),
    });
    return created.id;
  });
  return { userId, created: true };
}

async function linkIdentity(userId: string, provider: OAuthProviderId, profile: OAuthProfile) {
  const user = userId ? await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } }) : null;
  if (!user) throw new FlowError('session_required');

  const known = await findIdentity(provider, profile.id);
  if (known) {
    if (known.userId !== userId) throw new FlowError('identity_in_use');
    await touchIdentity(known.id, profile);
    return;
  }
  const mine = await db.query.userIdentities.findFirst({
    where: and(eq(userIdentities.userId, userId), eq(userIdentities.provider, provider)),
  });
  if (mine) throw new FlowError('provider_already_linked');

  await db.insert(userIdentities).values({
    userId,
    provider,
    providerUserId: profile.id,
    email: profile.email?.toLowerCase() ?? null,
    emailVerified: profile.emailVerified,
    lastUsedAt: new Date(),
  });
  await fillAvatar(userId, profile.avatarUrl);
}

/* ───────────────────────── settings: security ──────────────────────── */

export async function accountSecurity(userId: string): Promise<AccountSecurityDto> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { passwordHash: true },
    with: { identities: true },
  });
  if (!user) throw ApiError.notFound('That account no longer exists.');
  return {
    hasPassword: Boolean(user.passwordHash),
    identities: user.identities
      .filter((i) => OAUTH_PROVIDER_LABELS[i.provider as OAuthProviderId])
      .map((i) => ({
        provider: i.provider as OAuthProviderId,
        email: i.email,
        linkedAt: i.createdAt.toISOString(),
        lastUsedAt: i.lastUsedAt?.toISOString() ?? null,
      })),
    available: configuredProviders(),
  };
}

export async function unlinkIdentity(userId: string, provider: string) {
  const security = await accountSecurity(userId);
  const target = security.identities.find((i) => i.provider === provider);
  if (!target) throw ApiError.notFound('Tài khoản này chưa liên kết với nhà cung cấp đó.');
  if (!security.hasPassword && security.identities.length <= 1) {
    throw new ApiError(
      409,
      'LAST_SIGN_IN_METHOD',
      'Đây là cách đăng nhập duy nhất của bạn. Đặt mật khẩu hoặc liên kết tài khoản khác trước khi bỏ liên kết.',
    );
  }
  await db.delete(userIdentities).where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, provider)));
  return accountSecurity(userId);
}

/** Signs out every other device after a password change. */
export async function revokeOtherSessions(userId: string, currentRefreshToken: string | undefined) {
  const keep = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        keep ? ne(refreshTokens.tokenHash, keep) : undefined,
      ),
    );
}
