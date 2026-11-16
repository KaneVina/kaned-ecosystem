import { useEffect, useState } from 'react';
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
  // A picture that no longer loads (an expired provider URL, a deleted image)
  // falls back to the initials instead of a broken-image icon.
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  return (
    <span
      className={cn('avatar', `avatar-${size}`, className)}
      style={{ ['--c' as string]: avatarColor(name), overflow: 'hidden' }}
      aria-hidden
    >
      {src && !broken ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
