import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { safeNextPath, type OAuthProviderId } from '@kaned/shared';
import { Wordmark } from '@/components/ui/Wordmark';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { providerLabel, type OAuthProblem, type OAuthProblemCode } from './oauth';

/**
 * Where the API sends the browser after a provider round trip. A successful
 * sign-in has already set the refresh cookie, so the normal session bootstrap
 * picks the account up; this page only decides where to go next.
 */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const { user, initialising } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const done = useRef(false);

  const provider = (params.get('provider') as OAuthProviderId | null) ?? null;
  const intent = params.get('intent') === 'link' ? 'link' : 'login';
  const next = safeNextPath(params.get('next'), intent === 'link' ? '/app/settings' : '/app');
  const error = params.get('error') as OAuthProblemCode | null;

  useEffect(() => {
    if (done.current || initialising) return;
    done.current = true;

    if (error) {
      const problem: OAuthProblem = { code: error, provider, hint: params.get('hint') };
      if (intent === 'link' && user) navigate(next, { replace: true, state: { oauthProblem: problem } });
      else navigate('/login', { replace: true, state: { oauthProblem: problem, from: next } });
      return;
    }

    if (!user) {
      navigate('/login', { replace: true, state: { oauthProblem: { code: 'session_lost', provider }, from: next } });
      return;
    }

    if (intent === 'link') {
      toast.success(`Đã liên kết ${providerLabel(provider)}`, `Từ giờ bạn có thể đăng nhập Kaned bằng ${providerLabel(provider)}.`);
      navigate(next, { replace: true });
      return;
    }

    if (params.get('new') === '1') navigate('/welcome', { replace: true, state: { next } });
    else navigate(next, { replace: true });
  }, [error, initialising, intent, navigate, next, params, provider, toast, user]);

  return (
    <div className="booting">
      <div>
        <Wordmark />
        <p>{error ? 'Đang quay lại…' : `Đang hoàn tất đăng nhập bằng ${providerLabel(provider)}…`}</p>
      </div>
    </div>
  );
}
