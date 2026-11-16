import { z } from 'zod';
import { passwordSchema } from './schemas.js';

/**
 * Sign-in with an outside account. A provider only shows up on the sign-in
 * screen when the API has its client ID and secret, so adding one later is a
 * line in apps/api/.env, not a code change.
 */
export const OAUTH_PROVIDERS = ['google', 'microsoft', 'github', 'facebook'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];
export const oauthProviderSchema = z.enum(OAUTH_PROVIDERS);

export const OAUTH_PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  github: 'GitHub',
  facebook: 'Facebook',
};

/** Ways an account can sign in: its own password, or a linked provider. */
export type SignInMethod = 'password' | OAuthProviderId;

export type OAuthIntent = 'login' | 'link';

/**
 * Why a round trip through a provider did not end in a session. The API puts
 * the code in the URL it sends the browser back to; the web app words it.
 */
export const OAUTH_ERROR_CODES = [
  'cancelled', // the person closed or declined the provider's consent screen
  'expired', // the sign-in took too long, or the state did not match
  'not_configured', // the provider has no client ID / secret on this server
  'provider_error', // the provider refused the code or did not answer
  'email_missing', // the provider gave no verified email address
  'link_required', // an account has this email; prove it first, then link
  'identity_in_use', // this outside account is linked to another Kaned account
  'provider_already_linked', // this Kaned account already has another account of that provider
  'session_required', // linking needs a signed-in Kaned account
] as const;
export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

export interface AuthProviderDto {
  id: OAuthProviderId;
  label: string;
}

export interface AuthConfigDto {
  /** Providers ready to use on this server, in display order, with the URL that starts sign-in. */
  providers: Array<AuthProviderDto & { startUrl: string }>;
  /** True outside production, so the sign-in screen can say how to turn providers on. */
  showSetupHint: boolean;
}

export interface LinkedIdentityDto {
  provider: OAuthProviderId;
  email: string | null;
  linkedAt: string;
  lastUsedAt: string | null;
}

export interface AccountSecurityDto {
  hasPassword: boolean;
  identities: LinkedIdentityDto[];
  /** Providers this server can link right now. */
  available: AuthProviderDto[];
}

export interface LinkTicketDto {
  /** Absolute or same-origin URL that starts linking; open it with a full page load. */
  url: string;
}

export const setPasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/**
 * Where to land after signing in. Only a path on this site survives — never a
 * full URL, a protocol-relative "//host" or a backslash trick — so a crafted
 * sign-in link cannot bounce someone to another site.
 */
export function safeNextPath(value: unknown, fallback = '/app'): string {
  if (typeof value !== 'string' || value.length > 300) return fallback;
  if (!/^\/(?![/\\])[^\s\\]*$/.test(value)) return fallback;
  if (/^\/(login|register|auth\/)/.test(value)) return fallback;
  return value;
}
