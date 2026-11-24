import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

const STAR_PATH =
  'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';

/** Five stars with halves, using the #halfStar gradient defined once in App. */
export function Stars({ value, small, className }: { value: number; small?: boolean; className?: string }) {
  return (
    <span className={cn('stars', small && 'stars-sm', className)} role="img" aria-label={`${value.toFixed(1)} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const cls = value >= n - 0.25 ? '' : value >= n - 0.75 ? 'half' : 'off';
        return (
          <svg key={n} viewBox="0 0 24 24" className={cls || undefined} aria-hidden>
            <path d={STAR_PATH} />
          </svg>
        );
      })}
    </span>
  );
}

/** "★ 4.8" or a "Mới" badge when nobody has rated yet. */
export function RatingInline({ value, count }: { value: number; count: number }) {
  if (!count) return <span className="badge badge-violet badge-new">Mới</span>;
  return (
    <span className="rating" aria-label={`${value.toFixed(1)} trên 5 sao, ${count} đánh giá`}>
      <Star className="ic" aria-hidden />
      {value.toFixed(1)}
    </span>
  );
}

/** The half-star gradient referenced by .stars svg.half. Render once near the root. */
export function StarDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <linearGradient id="halfStar">
          <stop offset="50%" stopColor="#E7A033" />
          <stop offset="50%" stopColor="#E0E3EA" />
        </linearGradient>
      </defs>
    </svg>
  );
}
