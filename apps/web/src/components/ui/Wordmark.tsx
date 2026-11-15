import { cn } from '@/lib/cn';

/** KANED · ECOSYSTEM. The letters change colour one after another on hover (kaned.css). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('brand', className)} aria-label="Kaned Ecosystem">
      <span className="wm-k" aria-hidden>
        <i>K</i>
        <i>A</i>
        <i>N</i>
        <i>E</i>
        <i>D</i>
      </span>
      <span className="wm-e" aria-hidden>
        Ecosystem
      </span>
    </span>
  );
}
