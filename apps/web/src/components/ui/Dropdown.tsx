import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DropdownProps {
  /** Rendered inside the button that opens the menu. */
  trigger: (props: { open: boolean }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  width?: string;
  label: string;
  className?: string;
  menuClassName?: string;
}

/**
 * One dropdown for the whole product: the account menu, the tools menu and
 * any future menu behave the same for mouse, keyboard and screen readers.
 */
export function Dropdown({
  trigger,
  children,
  align = 'end',
  width = 'min-w-[240px]',
  label,
  className,
  menuClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center rounded outline-offset-2"
      >
        {trigger({ open })}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          onClick={(event) => {
            // Any menu item that is a link or a button closes the menu.
            if ((event.target as HTMLElement).closest('a,button')) setOpen(false);
          }}
          className={cn(
            'animate-scale-in absolute top-[calc(100%+8px)] z-50 rounded-xl border border-line bg-paper p-1.5 shadow-lg',
            align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            width,
            menuClassName,
          )}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  description,
  trailing,
  className,
  ...props
}: {
  icon?: ReactNode;
  description?: string;
  trailing?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      role="menuitem"
      type="button"
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-ink-2',
        'transition-colors hover:bg-sunk hover:text-ink focus-visible:bg-sunk focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 text-ink-3">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{children}</span>
        {description && <span className="block truncate text-xs text-ink-3">{description}</span>}
      </span>
      {trailing}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1.5 h-px bg-line" role="separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pt-2 pb-1 text-[11.5px] font-semibold tracking-wide text-ink-4 uppercase">{children}</p>;
}
