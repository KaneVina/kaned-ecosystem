import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Renders the official Google button. The client ID comes from the API so the
 * front end and the server can never drift apart on which project to trust.
 */
export function GoogleButton({ onCredential, disabled }: { onCredential: (credential: string) => void; disabled?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  const { data: config } = useQuery({
    queryKey: queryKeys.authConfig,
    queryFn: async () =>
      (await http.get<{ googleEnabled: boolean; googleClientId: string | null }>('/auth/config')).data,
    staleTime: Infinity,
  });

  const clientId = config?.googleClientId ?? import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

  useEffect(() => {
    if (!clientId) return;
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      setReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, [clientId]);

  useEffect(() => {
    if (!ready || !clientId || !holder.current || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => onCredential(response.credential),
    });
    window.google.accounts.id.renderButton(holder.current, {
      theme: 'outline',
      size: 'large',
      width: holder.current.offsetWidth || 380,
      text: 'continue_with',
      shape: 'rectangular',
      locale: 'vi',
    });
  }, [ready, clientId, onCredential]);

  if (!clientId) {
    return (
      <p className="auth-note auth-note-text">
        Đăng nhập Google chưa bật. Thêm <code>GOOGLE_CLIENT_ID</code> vào <code>apps/api/.env</code> rồi khởi động lại API.
      </p>
    );
  }

  return <div ref={holder} className="auth-google" style={disabled ? { pointerEvents: 'none', opacity: 0.6 } : undefined} />;
}
