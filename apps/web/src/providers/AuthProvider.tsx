import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, CurrentUserDto, LoginInput, RegisterInput, UpdateProfileInput } from '@kaned/shared';
import { bootstrapSession, http, onUnauthenticated, setAccessToken } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

interface AuthContextValue {
  user: CurrentUserDto | null;
  /** True until the refresh-on-load has settled, so routes do not flash. */
  initialising: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  setUser: (user: CurrentUserDto) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUserDto | null>(null);
  const [initialising, setInitialising] = useState(true);

  // A page reload still has the refresh cookie, so the session survives it.
  useEffect(() => {
    let cancelled = false;
    bootstrapSession().then((session) => {
      if (cancelled) return;
      if (session) setUser(session.user);
      setInitialising(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onUnauthenticated(() => {
      setUser(null);
      setAccessToken(null);
      queryClient.clear();
    });
  }, []);

  const apply = useCallback((data: AuthResponse) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    queryClient.clear();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initialising,
      setUser,
      async login(input) {
        const { data } = await http.post<AuthResponse>('/auth/login', input);
        apply(data);
      },
      async register(input) {
        const { data } = await http.post<AuthResponse>('/auth/register', input);
        apply(data);
      },
      async updateProfile(input) {
        const { data } = await http.patch<CurrentUserDto>('/auth/me', input);
        setUser(data);
      },
      async logout() {
        await http.post('/auth/logout').catch(() => undefined);
        setAccessToken(null);
        setUser(null);
        queryClient.clear();
      },
    }),
    [user, initialising, apply],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
