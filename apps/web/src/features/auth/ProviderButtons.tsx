import { useEffect, useState } from 'react';
import { OAUTH_PROVIDER_LABELS, type OAuthProviderId } from '@kaned/shared';
import { cn } from '@/lib/cn';
import { oauthStartHref, useAuthConfig } from './oauth';

/*
 * Official provider logos are not bundled. To show them, drop the files from
 * each provider's brand kit into src/assets/brands/ as google.svg,
 * microsoft.svg, github.svg, facebook.svg — they are picked up at build time.
 */
const BRAND_FILES = import.meta.glob('/src/assets/brands/*.{svg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function brandFile(provider: OAuthProviderId) {
  const hit = Object.entries(BRAND_FILES).find(([path]) => path.split('/').pop()?.startsWith(`${provider}.`));
  return hit?.[1];
}

const INITIALS: Record<OAuthProviderId, string> = { google: 'G', microsoft: 'M', github: 'GH', facebook: 'F' };

/** The provider's logo when one has been added, otherwise a plain monogram. */
export function ProviderMark({ provider, size = 22 }: { provider: OAuthProviderId; size?: number }) {
  const src = brandFile(provider);
  if (src) return <img className="sso-logo" src={src} alt="" width={size} height={size} />;
  return (
    <span className="sso-mono" style={{ width: size, height: size, fontSize: size * (INITIALS[provider].length > 1 ? 0.4 : 0.5) }} aria-hidden>
      {INITIALS[provider]}
    </span>
  );
}

/**
 * "Continue with …" buttons for every provider the API has turned on. Each is
 * a real link, so the browser does a full page load to the API, which sends it
 * on to the provider.
 */
export function ProviderButtons({ next, divider = 'hoặc tiếp tục với' }: { next?: string; divider?: string }) {
  const { data: config, isLoading } = useAuthConfig();
  const [leaving, setLeaving] = useState<OAuthProviderId | null>(null);
  const providers = config?.providers ?? [];

  // Coming back with the browser's Back button restores this page from cache;
  // the buttons must not stay locked in "leaving".
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setLeaving(null);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  if (isLoading) {
    return (
      <>
        <div className="auth-or">{divider}</div>
        <div className="sso-grid" aria-busy>
          <span className="sso-btn sso-skel" />
          <span className="sso-btn sso-skel" />
        </div>
      </>
    );
  }

  if (!providers.length) {
    if (!config?.showSetupHint) return null;
    return (
      <>
        <div className="auth-or">{divider}</div>
        <p className="auth-note auth-note-text">
          Chưa bật đăng nhập bằng Google, Microsoft, GitHub hay Facebook. Thêm client ID và secret vào{' '}
          <code>apps/api/.env</code> rồi khởi động lại API — xem mục “Đăng nhập bằng tài khoản bên thứ ba” trong README.
        </p>
      </>
    );
  }

  const single = providers.length === 1;
  return (
    <>
      <div className="auth-or">{divider}</div>
      <div className={cn('sso-grid', single && 'sso-grid-one', providers.length === 3 && 'sso-grid-three')}>
        {providers.map((p) => (
          <a
            key={p.id}
            className={cn('sso-btn', leaving === p.id && 'is-leaving')}
            href={oauthStartHref(p.startUrl, next)}
            aria-disabled={Boolean(leaving) || undefined}
            onClick={(e) => {
              if (leaving) e.preventDefault();
              else setLeaving(p.id);
            }}
          >
            <ProviderMark provider={p.id} />
            <span>{single ? `Tiếp tục với ${p.label}` : p.label}</span>
            {leaving === p.id && <span className="sso-spin" aria-label={`Đang chuyển tới ${p.label}`} />}
          </a>
        ))}
      </div>
    </>
  );
}

export const providerName = (p: OAuthProviderId) => OAUTH_PROVIDER_LABELS[p];
