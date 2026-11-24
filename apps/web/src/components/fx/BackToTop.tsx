import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/cn';

const R = 19;
const C = 2 * Math.PI * R;

/**
 * Round button that appears once a long page has been scrolled a screen or so.
 * Its ring fills as you read down; pressing it glides back to the top.
 */
export function BackToTop() {
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);
  const ring = useRef<SVGCircleElement>(null);
  const quiet = pathname.startsWith('/app/vec/room/');

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      setShow(y > window.innerHeight * 1.1 && max > window.innerHeight * 1.5);
      if (ring.current) ring.current.style.strokeDashoffset = String(C * (1 - Math.min(1, max > 0 ? y / max : 0)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pathname]);

  if (quiet) return null;
  const up = () => {
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    // Keyboard users land at the top of the page too.
    const main = document.querySelector<HTMLElement>('main, [role="main"]');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }
  };
  return (
    <button type="button" className={cn('to-top', show && 'is-on')} onClick={up} aria-label="Lên đầu trang" tabIndex={show ? 0 : -1} aria-hidden={!show}>
      <svg className="to-top-svg" viewBox="0 0 44 44" aria-hidden>
        <circle className="to-top-track" cx="22" cy="22" r={R} />
        <circle ref={ring} className="to-top-ring" cx="22" cy="22" r={R} style={{ strokeDasharray: C, strokeDashoffset: C }} />
      </svg>
      <ArrowUp className="ic ic-sm" />
    </button>
  );
}
