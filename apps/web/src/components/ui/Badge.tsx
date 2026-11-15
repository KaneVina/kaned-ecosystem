import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'brand' | 'green' | 'ok' | 'amber' | 'warn' | 'info' | 'danger' | 'neutral';

const TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  green: 'bg-green-50 text-green',
  ok: 'bg-green-50 text-green',
  amber: 'bg-amber-50 text-amber-700',
  warn: 'bg-amber-50 text-amber-700',
  info: 'bg-info-50 text-info',
  danger: 'bg-danger-50 text-danger',
  neutral: 'bg-sunk text-ink-2',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** A removable filter chip. */
export function Chip({
  label,
  value,
  onRemove,
}: {
  label?: string;
  value: ReactNode;
  onRemove?: () => void;
}) {
  return (
    <span className="animate-scale-in inline-flex h-[30px] items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 pl-3 pr-1.5 text-[13px] font-medium text-brand-700">
      {label && <span className="font-normal text-brand-600/70">{label}:</span>}
      {value}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Bỏ lọc ${label ?? ''} ${String(value)}`}
          className="grid size-5 place-items-center rounded-full text-brand-600 hover:bg-brand-100"
        >
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center gap-1 rounded-full border border-line-2 bg-paper px-2.5 text-[12.5px] text-ink-2',
        className,
      )}
    >
      {children}
    </span>
  );
}
