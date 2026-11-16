import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

const KANED = ['K', 'A', 'N', 'E', 'D'];
const ECOSYSTEM = 'ECOSYSTEM'.split('');

/**
 * KANED with ECOSYSTEM underneath, spread to the same width. On hover the
 * letters change colour one after another (kaned.css).
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('brand', className)} aria-label="Kaned Ecosystem">
      <span className="wm-k" aria-hidden>
        {KANED.map((c, i) => (
          <i key={i}>{c}</i>
        ))}
      </span>
      <span className="wm-e" aria-hidden>
        {ECOSYSTEM.map((c, i) => (
          <i key={i} style={{ '--d': i } as CSSProperties}>
            {c}
          </i>
        ))}
      </span>
    </span>
  );
}
