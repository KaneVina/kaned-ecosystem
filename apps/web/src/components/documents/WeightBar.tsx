import type { AssessmentItem } from '@kaned/shared';
import { cn } from '@/lib/cn';

/** Category colours, in order; final exams always take the deep violet. */
const PALETTE = ['#6C8CFF', '#2FB4A0', '#F2A541', '#E36F8E', '#6C93F5', '#4CB3E6', '#9BBE4A', '#D9825B'];
export const FINAL_COLOR = '#2448D8';

export function categoryColor(item: AssessmentItem, index: number) {
  return item.type === 'final' ? FINAL_COLOR : PALETTE[index % PALETTE.length];
}

/** One bar, one segment per category, as wide as its weight. */
export function WeightBar({ items, filled, className }: { items: AssessmentItem[]; filled?: Set<string>; className?: string }) {
  const total = items.reduce((s, i) => s + i.weight, 0) || 1;
  let ongoing = 0;
  return (
    <div className={cn('wbar', className)} role="img" aria-label={items.map((i) => `${i.name} ${i.weight}%`).join(', ')}>
      {items.map((item) => {
        const idx = item.type === 'final' ? 0 : ongoing++;
        return (
          <span
            key={item.id}
            className={cn('wbar-seg', filled && !filled.has(item.id) && 'is-empty')}
            style={{ width: `${(item.weight / total) * 100}%`, ['--c' as string]: categoryColor(item, idx) }}
            title={`${item.name}: ${item.weight}%`}
          />
        );
      })}
    </div>
  );
}
