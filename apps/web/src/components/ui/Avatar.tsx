import { avatarColor, initials } from '@/lib/format';
import { cn } from '@/lib/cn';

export function Avatar({
  name,
  src,
  size = 'sm',
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  return (
    <span
      className={cn('avatar', `avatar-${size}`, className)}
      style={{ ['--c' as string]: avatarColor(name), overflow: 'hidden' }}
      aria-hidden
    >
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(name)}
    </span>
  );
}
