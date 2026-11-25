import type { CSSProperties, ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ToolArt } from '@/components/illustrations/ToolArt';

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('skel', className)} style={style} aria-hidden />;
}

/** A notebook page with a magnifying glass: the prototype's empty-state art. */
export function EmptyArt() {
  return <ToolArt name="empty" className="empty-art" />;
}

export function EmptyState({
  title,
  description,
  action,
  art,
  compact,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  art?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('empty', compact && 'empty-compact')}>
      {art ?? <EmptyArt />}
      <h3 className="t-h3">{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-actions">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Không tải được dữ liệu',
  description,
  onRetry,
}: {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="empty empty-compact" role="alert">
      <ToolArt name="error" className="empty-art" />
      <h3 className="t-h3">{title}</h3>
      <p>{description ?? 'Máy chủ không phản hồi. Kiểm tra API rồi thử lại.'}</p>
      {onRetry && (
        <div className="empty-actions">
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            <RotateCcw className="ic ic-sm" />
            Thử lại
          </button>
        </div>
      )}
    </div>
  );
}

export function Progress({ value, tone = 'violet', className }: { value: number; tone?: 'violet' | 'green' | 'amber' | 'red'; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('progress', `progress-${tone}`, className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
