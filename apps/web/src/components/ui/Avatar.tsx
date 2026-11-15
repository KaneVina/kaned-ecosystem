import { avatarColor, initials } from '@/lib/format';
import { cn } from '@/lib/cn';

const SIZES = {
  xs: 'size-[22px] text-[9px]',
  sm: 'size-7 text-[11px]',
  md: 'size-10 text-[14px]',
  lg: 'size-14 text-[19px]',
  xl: 'size-24 text-[32px]',
} as const;

export function Avatar({
  name,
  src,
  size = 'sm',
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      aria-hidden
      title={name}
      style={{ background: avatarColor(name) }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold text-white',
        'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]',
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
