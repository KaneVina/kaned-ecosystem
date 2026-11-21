import { useEffect } from 'react';

/**
 * One reference-counted page scroll lock. Every overlay (drawer, dialog, side
 * panel) takes a lock while open and always gives it back when it closes OR
 * unmounts, so leaving a page with something open can never leave the page
 * stuck unscrollable. The class is removed only when the last lock is released.
 */
let locks = 0;
const apply = () => document.body.classList.toggle('no-scroll', locks > 0);

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks += 1;
    apply();
    return () => {
      locks = Math.max(0, locks - 1);
      apply();
    };
  }, [active]);
}
