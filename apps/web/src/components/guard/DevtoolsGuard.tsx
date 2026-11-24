import { useEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';

/**
 * The developer-tools guard itself runs from <head> (src/guard/head-guard.js) before the app starts.
 * This only tells it, for the next page load, whether the signed-in person is an admin, who is let
 * through. Signing out or switching to another account clears it.
 */
export function DevtoolsGuard() {
  const { user, initialising } = useAuth();
  useEffect(() => {
    if (initialising) return;
    try {
      if (user?.role === 'ADMIN') localStorage.setItem('kaned.staff', '1');
      else localStorage.removeItem('kaned.staff');
    } catch {
      /* private mode */
    }
  }, [user, initialising]);
  return null;
}
