import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-paper shadow-xs', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  subtitle,
  icon,
  action,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Alias of description, for call sites that read better as a subtitle. */
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const sub = subtitle ?? description;
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 shrink-0 text-brand">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          {sub && <p className="mt-0.5 text-[13.5px] text-ink-3">{sub}</p>}
        </div>
      </div>
      {actions ?? action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

/** Page-level heading used at the top of every app screen. */
export function PageHeader({
  title,
  description,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Alias of description. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  const sub = subtitle ?? description;
  return (
    <header className="mb-6">
      {breadcrumb}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[clamp(24px,2.4vw,30px)] leading-tight font-semibold">{title}</h1>
          {sub && <p className="mt-2 max-w-[70ch] text-[14.5px] text-ink-3">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function StatCard({
  icon,
  value,
  label,
  hint,
  tone = 'brand',
}: {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  /** One line under the number: what it is measured against. */
  hint?: ReactNode;
  tone?: 'brand' | 'green' | 'amber' | 'info';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand',
    green: 'bg-green-50 text-green',
    amber: 'bg-amber-50 text-amber-700',
    info: 'bg-info-50 text-info',
  } as const;

  return (
    <div className="flex items-center gap-3.5 rounded-lg border border-line bg-paper p-4 shadow-xs transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-sm">
      {icon && <span className={cn('grid size-10 shrink-0 place-items-center rounded-[11px]', tones[tone])}>{icon}</span>}
      <div className="min-w-0">
        <span className="text-[12.5px] tracking-wide text-ink-4 uppercase">{label}</span>
        <b className="tabular mt-0.5 block text-xl leading-tight font-semibold">{value}</b>
        {hint && <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{hint}</span>}
      </div>
    </div>
  );
}
