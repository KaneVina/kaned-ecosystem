import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex gap-px', className)} role="img" aria-label={`${value.toFixed(1)} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={value >= i - 0.25 ? 'fill-amber text-amber' : 'fill-[#E3E0EA] text-[#E3E0EA]'}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function RatingInline({ value, count }: { value: number; count: number }) {
  if (!count) {
    return <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 text-[11px] font-semibold text-brand-600">Mới</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink">
      <Star className="size-3.5 fill-amber text-amber" aria-hidden />
      {value.toFixed(1)}
    </span>
  );
}
