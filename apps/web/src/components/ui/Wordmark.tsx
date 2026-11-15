import { cn } from '@/lib/cn';

const LETTERS = ['K', 'A', 'N', 'E', 'D'];

/**
 * The brand is type, not a picture: KANED in Syne with ECOSYSTEM beside it.
 * Hovering runs the violet through the letters one at a time.
 */
export function Wordmark({
  size = 'md',
  light,
  showTag = true,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  light?: boolean;
  showTag?: boolean;
  className?: string;
}) {
  const type = { sm: 'text-[17px]', md: 'text-[21px]', lg: 'text-[30px]' }[size];
  const tag = { sm: 'text-[8px]', md: 'text-[9.5px]', lg: 'text-[11px]' }[size];

  return (
    <span className={cn('group inline-flex items-baseline gap-2 whitespace-nowrap', className)}>
      <span
        aria-hidden
        className={cn('font-display leading-none font-extrabold tracking-[0.01em] uppercase', type, light ? 'text-white' : 'text-ink')}
      >
        {LETTERS.map((letter, i) => (
          <span
            key={letter}
            style={{ transitionDelay: `${i * 40}ms` }}
            className={cn(
              'inline-block transition-[color,transform] duration-300',
              light ? 'group-hover:text-brand-200' : 'group-hover:text-brand',
              'group-hover:-translate-y-0.5',
            )}
          >
            {letter}
          </span>
        ))}
      </span>
      {showTag && (
        <span
          aria-hidden
          className={cn(
            'relative font-semibold tracking-[0.26em] uppercase transition-colors duration-300',
            tag,
            light ? 'text-white/50 group-hover:text-brand-200' : 'text-ink-4 group-hover:text-brand-600',
            'after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-brand after:transition-[width] after:duration-500 group-hover:after:w-full',
          )}
        >
          Ecosystem
        </span>
      )}
      <span className="sr-only">Kaned Ecosystem</span>
    </span>
  );
}
