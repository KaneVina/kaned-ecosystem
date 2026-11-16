import { createHash, createHmac } from 'node:crypto';
import { OAUTH_PROVIDER_LABELS, type OAuthProviderId } from '@kaned/shared';
import { env } from '../../../env.js';

/**
 * The outside providers Kaned can sign in with. Each speaks OAuth 2.0
 * authorization code + PKCE; Google and Microsoft add OpenID Connect, so their
 * ID token's nonce and audience are checked too.
 *
 * Adding a provider is one entry here plus its client ID / secret in .env.
 */

export interface OAuthProfile {
  /** The provider's stable id for this account. */
  id: string;
  email: string | null;
  /** Only a verified email may be matched to an existing Kaned account. */
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

interface TokenSet {
  access_token: string;
  id_token?: string;
}

interface ProviderDef {
  id: OAuthProviderId;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  tokenMethod?: 'GET' | 'POST';
  scope: string;
  /** OpenID Connect: send a nonce and check the ID token. */
  oidc: boolean;
  authParams?: Record<string, string>;
  profile: (tokens: TokenSet, check: IdTokenCheck) => Promise<OAuthProfile>;
}

interface IdTokenCheck {
  nonce: string;
  clientId: string;
}

export class ProviderError extends Error {}

const TIMEOUT_MS = 10_000;

/** In tests every provider lives on a local fake server. */
function endpoint(provider: OAuthProviderId, real: string, path: string) {
  if (env.NODE_ENV === 'test' && env.OAUTH_TEST_SERVER) return `${env.OAUTH_TEST_SERVER.replace(/\/+$/, '')}/${provider}${path}`;
  return real;
}

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'User-Agent': 'Kaned', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: unknown) => {
    throw new ProviderError(`Could not reach ${new URL(url).host}: ${(e as Error).message}`);
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new ProviderError(`${new URL(url).host} answered ${res.status}: ${text.slice(0, 200)}`);
  return body as T;
}

/**
 * Claims of an ID token received straight from the provider's token endpoint
 * over TLS. OpenID Connect lets a client trust such a token without checking
 * its signature (Core §3.1.3.7); the nonce and audience are still checked so a
 * token minted for another sign-in or another app is refused.
 */
function idTokenClaims(token: string | undefined, check: IdTokenCheck): Record<string, unknown> {
  if (!token) throw new ProviderError('The provider sent no ID token.');
  const part = token.split('.')[1];
  if (!part) throw new ProviderError('The ID token is malformed.');
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new ProviderError('The ID token is malformed.');
  }
  const aud = claims.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(check.clientId)) throw new ProviderError('The ID token was issued for another app.');
  if (claims.nonce !== check.nonce) throw new ProviderError('The ID token belongs to another sign-in.');
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now() - 60_000) {
    throw new ProviderError('The ID token has expired.');
  }
  return claims;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const looksLikeEmail = (v: string | null) => (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null);

function definitions(): ProviderDef[] {
  const msTenant = encodeURIComponent(env.MICROSOFT_TENANT || 'common');
  const fbVersion = 'v21.0';

  return [
    {
      id: 'google',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorizeUrl: endpoint('google', 'https://accounts.google.com/o/oauth2/v2/auth', '/authorize'),
      tokenUrl: endpoint('google', 'https://oauth2.googleapis.com/token', '/token'),
      scope: 'openid email profile',
      oidc: true,
      authParams: { prompt: 'select_account' },
      async profile(tokens, check) {
        const claims = idTokenClaims(tokens.id_token, check);
        const info = await getJson<Record<string, unknown>>(
          endpoint('google', 'https://openidconnect.googleapis.com/v1/userinfo', '/userinfo'),
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        const id = str(info.sub);
        if (!id || id !== claims.sub) throw new ProviderError('Google returned a different account.');
        return {
          id,
          email: looksLikeEmail(str(info.email)),
          emailVerified: info.email_verified === true || info.email_verified === 'true',
          name: str(info.name),
          avatarUrl: str(info.picture),
        };
      },
    },
    {
      id: 'microsoft',
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      authorizeUrl: endpoint('microsoft', `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/authorize`, '/authorize'),
      tokenUrl: endpoint('microsoft', `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/token`, '/token'),
      scope: 'openid email profile',
      oidc: true,
      authParams: { prompt: 'select_account', response_mode: 'query' },
      async profile(tokens, check) {
        const claims = idTokenClaims(tokens.id_token, check);
        const id = str(claims.sub);
        if (!id) throw new ProviderError('Microsoft returned no account id.');
        return {
          id,
          email: looksLikeEmail(str(claims.email)) ?? looksLikeEmail(str(claims.preferred_username)),
          // Microsoft does not promise the address belongs to the person
          // unless the tenant proves domain ownership (xms_edov). Without that
          // the email is used for a new account but never to take over an
          // existing one.
          emailVerified: claims.xms_edov === true || claims.xms_edov === 1 || claims.xms_edov === '1',
          name: str(claims.name),
          avatarUrl: null,
        };
      },
    },
    {
      id: 'github',
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorizeUrl: endpoint('github', 'https://github.com/login/oauth/authorize', '/authorize'),
      tokenUrl: endpoint('github', 'https://github.com/login/oauth/access_token', '/token'),
      scope: 'read:user user:email',
      oidc: false,
      authParams: { allow_signup: 'true' },
      async profile(tokens) {
        const headers = { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/vnd.github+json' };
        const [user, emails] = await Promise.all([
          getJson<Record<string, unknown>>(endpoint('github', 'https://api.github.com/user', '/user'), { headers }),
          getJson<Array<{ email: string; primary: boolean; verified: boolean }>>(
            endpoint('github', 'https://api.github.com/user/emails', '/user/emails'),
            { headers },
          ).catch(() => []),
        ]);
        const id = user.id != null ? String(user.id) : null;
        if (!id) throw new ProviderError('GitHub returned no account id.');
        const verified = emails.filter((e) => e.verified);
        const pick = verified.find((e) => e.primary) ?? verified[0];
        return {
          id,
          email: looksLikeEmail(pick?.email ?? null),
          emailVerified: Boolean(pick),
          name: str(user.name) ?? str(user.login),
          avatarUrl: str(user.avatar_url),
        };
      },
    },
    {
      id: 'facebook',
      clientId: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
      authorizeUrl: endpoint('facebook', `https://www.facebook.com/${fbVersion}/dialog/oauth`, '/authorize'),
      tokenUrl: endpoint('facebook', `https://graph.facebook.com/${fbVersion}/oauth/access_token`, '/token'),
      tokenMethod: 'GET',
      scope: 'email public_profile',
      oidc: false,
      async profile(tokens) {
        // appsecret_proof keeps a leaked access token useless without the secret.
        const proof = createHmac('sha256', env.FACEBOOK_CLIENT_SECRET).update(tokens.access_token).digest('hex');
        const url = new URL(endpoint('facebook', `https://graph.facebook.com/${fbVersion}/me`, '/me'));
        url.searchParams.set('fields', 'id,name,email');
        url.searchParams.set('access_token', tokens.access_token);
        url.searchParams.set('appsecret_proof', proof);
        const me = await getJson<Record<string, unknown>>(url.toString());
        const id = str(me.id);
        if (!id) throw new ProviderError('Facebook returned no account id.');
        const email = looksLikeEmail(str(me.email));
        return {
          id,
          email,
          // Facebook only hands out addresses the person has confirmed.
          emailVerified: Boolean(email),
          name: str(me.name),
          // Facebook picture URLs expire within days, so none is stored.
          avatarUrl: null,
        };
      },
    },
  ];
}

const ALL = definitions();

export function getProvider(id: string): ProviderDef | null {
  const def = ALL.find((p) => p.id === id);
  return def && def.clientId && def.clientSecret ? def : null;
}

/** Providers with a client ID and secret, in display order. */
export function configuredProviders() {
  return ALL.filter((p) => p.clientId && p.clientSecret).map((p) => ({ id: p.id, label: OAUTH_PROVIDER_LABELS[p.id] }));
}

export function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function authorizeUrl(
  def: ProviderDef,
  params: { state: string; verifier: string; nonce: string; redirectUri: string },
) {
  const url = new URL(def.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', def.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', def.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', pkceChallenge(params.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  if (def.oidc) url.searchParams.set('nonce', params.nonce);
  for (const [k, v] of Object.entries(def.authParams ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

export async function exchangeCode(def: ProviderDef, code: string, verifier: string, redirectUri: string): Promise<TokenSet> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: def.clientId,
    client_secret: def.clientSecret,
    code_verifier: verifier,
  });
  const body =
    def.tokenMethod === 'GET'
      ? await getJson<Record<string, unknown>>(`${def.tokenUrl}?${params.toString()}`)
      : await getJson<Record<string, unknown>>(def.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
  // GitHub reports a bad code with 200 and an "error" field.
  const accessToken = str(body?.access_token);
  if (!accessToken) throw new ProviderError(`No access token: ${str(body?.error_description) ?? str(body?.error) ?? 'unknown'}`);
  return { access_token: accessToken, id_token: str(body.id_token) ?? undefined };
}

export async function fetchProfile(def: ProviderDef, tokens: TokenSet, nonce: string) {
  return def.profile(tokens, { nonce, clientId: def.clientId });
}
