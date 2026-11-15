import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

interface TriggerProps {
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-haspopup': 'menu';
  onClick: () => void;
}

/**
 * A .menu-anchor with a popover .menu. Closes on outside click, on Escape,
 * and when any item inside is chosen.
 */
export function Dropdown({
  trigger,
  children,
  className,
  align = 'right',
  width,
}: {
  trigger: (props: TriggerProps) => ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    // Mount first, then add .open on the next frame so the transition plays.
    const raf = requestAnimationFrame(() => setShown(true));
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      setShown(false);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-anchor" ref={ref}>
      {trigger({
        'aria-expanded': open,
        'aria-controls': id,
        'aria-haspopup': 'menu',
        onClick: () => setOpen((v) => !v),
      })}
      {open && (
        <div
          id={id}
          role="menu"
          className={cn('menu', shown && 'open', className)}
          style={{ ...(align === 'left' ? { left: 0, right: 'auto', transformOrigin: 'top left' } : {}), ...(width ? { width } : {}) }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[role=menuitem]')) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuLink({ to, icon, children, count }: { to: string; icon?: ReactNode; children: ReactNode; count?: number }) {
  return (
    <Link role="menuitem" to={to}>
      {icon}
      {children}
      {count !== undefined && <span className="menu-count">{count}</span>}
    </Link>
  );
}

export function MenuButton({ onClick, icon, children, danger }: { onClick: () => void; icon?: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <button role="menuitem" type="button" onClick={onClick} className={danger ? 'menu-danger' : undefined}>
      {icon}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-sep" role="separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="menu-label">{children}</p>;
}
