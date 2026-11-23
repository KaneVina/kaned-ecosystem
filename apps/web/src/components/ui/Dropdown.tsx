import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
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
  hover = false,
  portal = false,
}: {
  trigger: (props: TriggerProps) => ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right';
  width?: number;
  /** Open when the pointer rests on the trigger (mouse only); touch and keyboard still click. */
  hover?: boolean;
  /** Draw the menu on <body> at fixed coordinates, so a table or panel with overflow cannot clip it. */
  portal?: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; origin: string } | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();
  // Only a real mouse opens on hover; touch and pen taps fall through to the click toggle.
  const mouse = useRef(false);
  const canHover = () => hover && mouse.current;
  const enter = (e: RPointerEvent) => {
    mouse.current = e.pointerType === 'mouse';
    if (!canHover()) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 60);
  };
  const leave = (e: RPointerEvent) => {
    mouse.current = e.pointerType === 'mouse';
    if (!canHover()) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 160);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    // Mount first, then add .open on the next frame so the transition plays.
    const raf = requestAnimationFrame(() => setShown(true));
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onFar = () => setOpen(false);
    if (portal) {
      window.addEventListener('scroll', onFar, true);
      window.addEventListener('resize', onFar);
    }
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
      if (portal) {
        window.removeEventListener('scroll', onFar, true);
        window.removeEventListener('resize', onFar);
      }
    };
  }, [open, portal]);

  // Portal menus sit next to the trigger, flip above it when there is no room below.
  useLayoutEffect(() => {
    if (!open || !portal || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const h = menuRef.current?.offsetHeight ?? 0;
    const below = window.innerHeight - r.bottom;
    const up = h > below - 12 && r.top > below;
    setPos({
      top: up ? Math.max(8, r.top - h - 8) : r.bottom + 8,
      ...(align === 'left' ? { left: Math.max(8, r.left) } : { right: Math.max(8, window.innerWidth - r.right) }),
      origin: `${up ? 'bottom' : 'top'} ${align === 'left' ? 'left' : 'right'}`,
    });
  }, [open, portal, align, shown]);

  return (
    <div className="menu-anchor" ref={ref} onPointerEnter={enter} onPointerLeave={leave}>
      {trigger({
        'aria-expanded': open,
        'aria-controls': id,
        'aria-haspopup': 'menu',
        onClick: () => setOpen((v) => (canHover() ? true : !v)),
      })}
      {open && (() => {
        const el = (
          <div
            id={id}
            ref={menuRef}
            role="menu"
            className={cn('menu', shown && 'open', className)}
            style={
              portal
                ? { position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? 'auto', right: pos?.right ?? 'auto', transformOrigin: pos?.origin, zIndex: 130, ...(width ? { width } : {}) }
                : { ...(align === 'left' ? { left: 0, right: 'auto', transformOrigin: 'top left' } : {}), ...(width ? { width } : {}) }
            }
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('[role=menuitem]')) setOpen(false);
            }}
          >
            {children}
          </div>
        );
        return portal ? createPortal(el, document.body) : el;
      })()}
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
