import { pointerFxEnabled } from '@/lib/pointerFxPref';

/**
 * A short buzz on phones that support it (Android), as feedback for an answer.
 * Nothing on desktops, iPhones (no Vibration API), with the effects setting off,
 * or with reduced motion.
 */
export function buzz(kind: 'ok' | 'bad' | 'tap') {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  if (!window.matchMedia?.('(pointer: coarse)').matches) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !pointerFxEnabled()) return;
  try {
    navigator.vibrate(kind === 'ok' ? 14 : kind === 'bad' ? [20, 60, 20] : 8);
  } catch {
    /* blocked until the user has interacted: fine */
  }
}
