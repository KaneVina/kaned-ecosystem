import { useEffect, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';

/**
 * Site-wide, polite deterrent: it stops the usual shortcuts that open the
 * browser's developer tools or view-source. It does not pretend to be security
 * (the server never trusts the browser); it only removes the casual route.
 *
 * It never touches normal editing keys (copy, paste, select all, find, reload,
 * print, save), never loops on `debugger`, and leaves staff and local
 * development alone. The context menu is blocked only inside elements marked
 * `data-protected`, i.e. the exam room.
 */
export function DevtoolsGuard() {
  const { user } = useAuth();
  const { info } = useToast();
  const last = useRef(0);
  const off = import.meta.env.DEV || import.meta.env.VITE_DEVTOOLS_GUARD === 'off' || user?.role === 'ADMIN';

  useEffect(() => {
    if (off) return;
    const tell = () => {
      const now = Date.now();
      if (now - last.current < 10_000) return;
      last.current = now;
      info('Phím tắt này bị tắt trên Kaned', 'Công cụ nhà phát triển không dùng được ở đây.');
    };
    const onKey = (e: KeyboardEvent) => {
      const code = e.code;
      const ctrlShift = (e.ctrlKey || e.metaKey) && e.shiftKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyK'].includes(code);
      const macAlt = e.metaKey && e.altKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyU'].includes(code);
      const viewSource = e.ctrlKey && !e.shiftKey && !e.altKey && code === 'KeyU';
      if (code === 'F12' || ctrlShift || macAlt || viewSource) {
        e.preventDefault();
        e.stopImmediatePropagation();
        tell();
      }
    };
    const onMenu = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-protected]')) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('contextmenu', onMenu, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('contextmenu', onMenu, true);
    };
  }, [off, info]);

  return null;
}
