import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {icon && <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand">{icon}</span>}
      <h3 className="text-[17px] font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-[44ch] text-[14.5px] text-ink-3">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2.5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  description,
  onRetry,
}: {
  title?: ReactNode;
  message?: ReactNode;
  /** Alias of message. */
  description?: ReactNode;
  onRetry?: () => void;
}) {
  const body = message ?? description;
  return (
    <div className="rounded-lg border border-danger/25 bg-danger-50 px-5 py-4 text-sm text-[#8c2a23]">
      <p className="font-semibold">{title ?? 'Không tải được dữ liệu'}</p>
      {body && <p className="mt-1 opacity-90">{body}</p>}
      {onRetry && (
        <button onClick={onRetry} className="mt-2.5 font-semibold underline underline-offset-2">
          Thử lại
        </button>
      )}
    </div>
  );
}

export function Progress({ value, tone = 'brand', className }: { value: number; tone?: 'brand' | 'green' | 'amber'; className?: string }) {
  const tones = { brand: 'bg-brand', green: 'bg-green', amber: 'bg-amber' } as const;
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-sunk', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-700', tones[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
