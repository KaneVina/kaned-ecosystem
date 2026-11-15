import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'violet' | 'green' | 'amber' | 'red' | 'blue' | 'gray';

export function Badge({ tone = 'gray', className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return <span className={cn('badge', `badge-${tone}`, className)}>{children}</span>;
}

/** A removable filter chip: "Trường: FPTU ×". */
export function Chip({ k, children, onRemove }: { k?: ReactNode; children: ReactNode; onRemove: () => void }) {
  return (
    <span className="chip">
      {k && <span className="k">{k}:</span>}
      {children}
      <button type="button" onClick={onRemove} aria-label="Bỏ bộ lọc này">
        <X className="ic ic-xs" />
      </button>
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('tag', className)}>{children}</span>;
}

/** A single-select pill. */
export function Pill({
  pressed,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return (
    <button type="button" aria-pressed={pressed} className={cn('pill', className)} {...rest}>
      {children}
    </button>
  );
}
