import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Search, X, type LucideIcon } from 'lucide-react';
import { DOCUMENT_STATUS_LABELS, ROLE_LABELS, type DocumentStatus, type Role } from '@kaned/shared';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Mount → next frame add "open" → on close remove it and unmount after the transition. */
function usePresence(open: boolean, ms: number) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), reduceMotion() ? 0 : ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted, shown };
}

/** Keeps Tab inside a dialog and restores focus to where it was when it closes. */
function useFocusTrap(open: boolean, panel: React.RefObject<HTMLElement>, onEscape: () => void) {
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])');
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      returnTo.current?.focus?.({ preventScroll: true });
    };
  }, [open, panel, onEscape]);
}

/* ─────────────────────────────── page head ─────────────────────────────── */

export function AdminHead({ title, count, description, actions }: { title: ReactNode; count?: number; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="adm-head">
      <div>
        <h1>
          {title}
          {count !== undefined && <small>{fmtInt(count)}</small>}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="adm-head-actions">{actions}</div>}
    </header>
  );
}

/* ─────────────────────────────── numbers ──────────────────────────────── */

/** Counts up the first time it appears; later changes jump. */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() => (reduceMotion() ? value : 0));
  const first = useRef(true);
  useEffect(() => {
    if (!first.current || reduceMotion()) {
      setShown(value);
      return;
    }
    first.current = false;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 500);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmtInt(shown)}</>;
}

export function StatCard({ icon: Icon, label, value, sub, to, attention }: { icon: LucideIcon; label: string; value: number | undefined; sub?: ReactNode; to?: string; attention?: boolean }) {
  const body = (
    <>
      <span className="adm-stat-top">
        {label}
        <Icon className="ic" />
      </span>
      <b>{value === undefined ? <span className="skel adm-skel-num" /> : <CountUp value={value} />}</b>
      {sub && <small>{sub}</small>}
    </>
  );
  const cls = cn('adm-stat', attention && 'is-attention');
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ─────────────────────────────── labels ──────────────────────────────── */

const STATUS_CLASS: Record<DocumentStatus, string> = { PENDING: 'st-pending', PUBLISHED: 'st-published', REJECTED: 'st-rejected', REMOVED: 'st-removed' };
export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={cn('st', STATUS_CLASS[status])}>
      <i />
      {DOCUMENT_STATUS_LABELS[status].vi}
    </span>
  );
}

const ROLE_CLASS: Record<Role, string> = { STUDENT: 'st-student', MODERATOR: 'st-mod', ADMIN: 'st-admin' };
export function RoleBadge({ role }: { role: Role }) {
  return <span className={cn('st', ROLE_CLASS[role])}>{ROLE_LABELS[role].vi}</span>;
}

export function Swatch({ color }: { color: string }) {
  return <span className="adm-swatch" style={{ background: color }} aria-hidden />;
}

/** A school's colour block with its code, used wherever a school is listed. */
export function UniMark({ u, size }: { u: { code: string; color: string }; size?: number }) {
  const code = u.code.slice(0, 6);
  // Longer codes get smaller type so "HCMUT" still fits the square.
  const fontSize = code.length <= 3 ? 11 : code.length === 4 ? 9.5 : code.length === 5 ? 8 : 7;
  return (
    <span className="adm-uni-mark" style={{ background: u.color, fontSize, ...(size ? { width: size, height: size } : {}) }} aria-hidden>
      {code}
    </span>
  );
}

/* ─────────────────────────────── inputs ──────────────────────────────── */

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="adm-search">
      <Search className="ic" />
      <input className="input" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
      {value && (
        <button type="button" className="adm-search-x" onClick={() => onChange('')} aria-label="Xoá tìm kiếm">
          <X className="ic ic-xs" />
        </button>
      )}
    </label>
  );
}

export function TableCheck({ checked, onChange, label, indeterminate }: { checked: boolean; onChange: () => void; label: string; indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <label className="check" onClick={(e) => e.stopPropagation()}>
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
      <span className="box">
        <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    </label>
  );
}

export function Pager({ page, totalPages, total, onPage, unit }: { page: number; totalPages: number; total: number; onPage: (p: number) => void; unit: string }) {
  return (
    <div className="adm-pager">
      <span>
        {fmtInt(total)} {unit}
      </span>
      {totalPages > 1 && (
        <div className="adm-pager-btns">
          <button type="button" className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">
            <ChevronLeft className="ic" />
          </button>
          <span>
            <b>{page}</b> / {totalPages}
          </span>
          <button type="button" className="icon-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Trang sau">
            <ChevronRight className="ic" />
          </button>
        </div>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <span className="skel" style={{ display: 'block', height: 10, borderRadius: 5, width: c === 0 ? '62%' : c === cols - 1 ? 20 : '44%' }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/* ─────────────────────────────── empty ──────────────────────────────── */

export function EmptyBlock({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="adm-empty">
      <span className="adm-empty-ic">
        <Icon className="ic" />
      </span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action && <div className="adm-empty-act">{action}</div>}
    </div>
  );
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tbody>
      <tr>
        <td colSpan={cols} className="adm-empty-row">
          {children}
        </td>
      </tr>
    </tbody>
  );
}

/* ─────────────────────────────── action menu ─────────────────────────────── */

export type MenuItem =
  | { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; hidden?: boolean; disabled?: boolean }
  | 'separator';

/**
 * The "⋯" menu on a row. Portalled and positioned against the button, so it
 * is never clipped by a table or card and flips up near the bottom of the
 * screen. Arrow keys move, Escape closes and returns focus.
 */
export function ActionMenu({
  items,
  label = 'Thao tác',
  className,
  button,
}: {
  items: MenuItem[];
  label?: string;
  className?: string;
  /** Show a labelled button ("Tạo mới ▾") instead of the "⋯" icon. */
  button?: { text: string; icon?: LucideIcon; variant?: 'primary' | 'secondary' | 'ghost' };
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => i === 'separator' || !i.hidden);

  useLayoutEffect(() => {
    if (!open || !btn.current || !menu.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = menu.current.offsetHeight;
    const w = menu.current.offsetWidth;
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    setPos({ top, left });
    menu.current.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const onKey = (e: ReactKeyboardEvent) => {
    const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled])') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[(i + 1) % all.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      all[(i - 1 + all.length) % all.length]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cn(button ? `btn btn-${button.variant ?? 'secondary'} btn-sm` : 'icon-btn row-menu-btn', className)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={button ? undefined : label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {button ? (
          <>
            {button.icon && <button.icon className="ic" />}
            {button.text}
            <ChevronDown className="ic" style={{ width: 13, height: 13, marginRight: -2 }} />
          </>
        ) : (
          <MoreHorizontal className="ic" />
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={label}
            className="amenu"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            onKeyDown={onKey}
            onClick={(e) => e.stopPropagation()}
          >
            {visible.map((item, i) =>
              item === 'separator' ? (
                i > 0 && i < visible.length - 1 ? <div key={i} className="sep" role="separator" /> : null
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={cn(item.danger && 'is-danger')}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.icon && <item.icon className="ic" />}
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ─────────────────────────────── dialog ──────────────────────────────── */

/** A centred dialog: icon beside the title, text under it, buttons on the right. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  tone = 'default',
  size = 'sm',
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
  size?: 'sm' | 'md';
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const { mounted, shown } = usePresence(open, 200);
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panel, onClose);
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('input, [data-autofocus]') ?? panel.current;
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);
  if (!mounted) return null;
  return createPortal(
    <div className={cn('dlg-wrap', shown && 'open')}>
      <div className="dlg-backdrop" onClick={onClose} />
      <div ref={panel} className={cn('dlg', size === 'md' && 'dlg-md')} role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" tabIndex={-1}>
        <div className="dlg-head">
          {Icon && (
            <span className={cn('dlg-ic', tone === 'danger' && 'is-danger')}>
              <Icon className="ic" />
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <h2 className="dlg-title" id="dlg-title">
              {title}
            </h2>
            {description && <div className="dlg-desc">{description}</div>}
          </div>
        </div>
        {children && <div className="dlg-body">{children}</div>}
        {footer && <div className="dlg-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmState {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Ask the admin to type this word before the button unlocks. */
  typeToConfirm?: string;
  /** Not destructive: a neutral icon and a primary button. */
  safe?: boolean;
  run: () => Promise<unknown>;
}

/** Destructive actions ask first; the riskiest ones ask you to type the code. */
export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const last = useRef(state);
  if (state) last.current = state;
  const s = last.current;
  useEffect(() => setTyped(''), [state]);
  const locked = Boolean(s?.typeToConfirm) && typed.trim().toUpperCase() !== s?.typeToConfirm?.toUpperCase();
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const confirm = async () => {
    if (!s || locked || busy) return;
    setBusy(true);
    try {
      await s.run();
      onClose();
    } catch {
      // The caller already showed what went wrong.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(state)}
      onClose={close}
      icon={AlertTriangle}
      tone={s?.safe ? 'default' : 'danger'}
      title={s?.title}
      description={s?.body}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={close} disabled={busy} data-autofocus={s?.typeToConfirm ? undefined : true}>
            Huỷ
          </button>
          <button type="button" className={cn('btn', s?.safe ? 'btn-primary' : 'btn-danger', busy && 'is-loading')} disabled={locked || busy} onClick={confirm}>
            {s?.confirmLabel}
          </button>
        </>
      }
    >
      {s?.typeToConfirm && (
        <label className="dlg-confirm">
          <span>
            Gõ <code>{s.typeToConfirm}</code> để xác nhận
          </span>
          <input
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      )}
    </Dialog>
  );
}

/* ─────────────────────────────── sheet ──────────────────────────────── */

/** A panel that slides in from the right for create / edit forms. */
export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  children: ReactNode;
}) {
  const { mounted, shown } = usePresence(open, 300);
  const panel = useRef<HTMLDivElement>(null);
  // A dialog opened on top of the sheet handles Escape itself.
  const onEscape = useCallback(() => {
    if (!document.querySelector('.dlg-wrap')) onClose();
  }, [onClose]);
  useFocusTrap(open, panel, onEscape);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('no-scroll');
    const raf = requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLElement>('.sheet-body input:not([type=hidden]):not([type=radio]):not([type=checkbox]), .sheet-body select, .sheet-body textarea')?.focus({ preventScroll: true }),
    );
    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove('no-scroll');
    };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <div className={cn('sheet-wrap', shown && 'open')}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div ref={panel} className={cn('sheet', size === 'lg' && 'sheet-lg')} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="sheet-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X className="ic" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
