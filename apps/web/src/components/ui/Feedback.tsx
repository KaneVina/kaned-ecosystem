import type { CSSProperties, ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('skel', className)} style={style} aria-hidden />;
}

/** A notebook page with a magnifying glass: the prototype's empty-state art. */
export function EmptyArt() {
  return (
    <svg className="empty-art" viewBox="0 0 160 120" aria-hidden>
      <rect x="22" y="10" width="92" height="104" rx="6" fill="#fff" stroke="#D9D6E4" />
      <g stroke="rgba(120,100,210,.18)">
        {Array.from({ length: 12 }, (_, k) => (
          <line key={k} x1="22" x2="114" y1={18 + k * 8} y2={18 + k * 8} />
        ))}
      </g>
      <line x1="38" y1="10" x2="38" y2="114" stroke="#E0483E" strokeOpacity=".5" />
      <rect x="46" y="26" width="46" height="5" rx="2.5" fill="#E4E0FA" />
      <rect x="46" y="40" width="56" height="4" rx="2" fill="#ECEAF3" />
      <rect x="46" y="50" width="40" height="4" rx="2" fill="#ECEAF3" />
      <circle cx="110" cy="78" r="22" fill="#F2F0FC" stroke="#4433B4" strokeWidth="3" />
      <line x1="126" y1="94" x2="142" y2="110" stroke="#4433B4" strokeWidth="6" strokeLinecap="round" />
      <path d="M101 72 q9-7 18 0" stroke="#4433B4" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
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
      <span className="confirm-ic is-danger">
        <TriangleAlert className="ic ic-lg" />
      </span>
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
