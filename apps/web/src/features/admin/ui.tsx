import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { DOCUMENT_STATUS_LABELS, ROLE_LABELS, type DocumentStatus, type Role } from '@kaned/shared';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';

/* ─────────────────────────────── page head ─────────────────────────────── */

export function AdminHead({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="adm-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="adm-head-actions">{actions}</div>}
    </header>
  );
}

/* ─────────────────────────────── numbers ──────────────────────────────── */

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts up to the value the first time it appears; later changes jump. */
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
    const duration = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmtInt(shown)}</>;
}

export function StatCard({
  icon,
  tone = 'violet',
  label,
  value,
  sub,
  to,
}: {
  icon: ReactNode;
  tone?: 'violet' | 'green' | 'amber' | 'red' | 'blue' | 'teal' | 'gray';
  label: string;
  value: number | undefined;
  sub?: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <span className="adm-stat-top">
        <span className={cn('adm-stat-ic', `tone-${tone}`)}>{icon}</span>
        {label}
      </span>
      <b>{value === undefined ? <span className="skel adm-skel-num" /> : <CountUp value={value} />}</b>
      {sub && <small>{sub}</small>}
    </>
  );
  return to ? (
    <Link to={to} className="adm-stat">
      {body}
    </Link>
  ) : (
    <div className="adm-stat">{body}</div>
  );
}

/* ─────────────────────────────── badges ──────────────────────────────── */

const STATUS_TONE: Record<DocumentStatus, string> = { PENDING: 'amber', PUBLISHED: 'green', REJECTED: 'red', REMOVED: 'gray' };
export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={cn('badge', `badge-${STATUS_TONE[status]}`, 'adm-status')}>
      <i />
      {DOCUMENT_STATUS_LABELS[status].vi}
    </span>
  );
}

const ROLE_TONE: Record<Role, string> = { STUDENT: 'gray', MODERATOR: 'blue', ADMIN: 'violet' };
export function RoleBadge({ role }: { role: Role }) {
  return <span className={cn('badge', `badge-${ROLE_TONE[role]}`)}>{ROLE_LABELS[role].vi}</span>;
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
      <Search className="ic ic-sm" />
      <input className="input" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" className="adm-search-x" onClick={() => onChange('')} aria-label="Xoá tìm kiếm">
          <X className="ic ic-xs" />
        </button>
      )}
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
            <ChevronLeft className="ic ic-sm" />
          </button>
          <span>
            Trang <b>{page}</b> / {totalPages}
          </span>
          <button type="button" className="icon-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Trang sau">
            <ChevronRight className="ic ic-sm" />
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
              <span className="skel" style={{ display: 'block', height: 12, width: c === 0 ? '70%' : '45%' }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
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
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement;
      setMounted(true);
      const raf = requestAnimationFrame(() => {
        setShown(true);
        panel.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus({ preventScroll: true });
      });
      document.body.classList.add('no-scroll');
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    document.body.classList.remove('no-scroll');
    const t = setTimeout(() => {
      setMounted(false);
      returnTo.current?.focus?.();
    }, 320);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-wrap')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className={cn('sheet-wrap', shown && 'open')}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div ref={panel} className={cn('sheet', size === 'lg' && 'sheet-lg')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X className="ic ic-sm" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────────────────────── confirm ─────────────────────────────── */

export interface ConfirmState {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Ask the admin to type this word before the button unlocks. */
  typeToConfirm?: string;
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

  return (
    <Modal open={Boolean(state)} onClose={busy ? () => undefined : onClose} title={s?.title ?? ''} size="sm" bare className="modal-confirm">
      <div className="modal-body confirm">
        <span className="confirm-ic is-danger">
          <AlertTriangle className="ic" />
        </span>
        <h2 className="t-h3">{s?.title}</h2>
        <div className="adm-confirm-body">{s?.body}</div>
        {s?.typeToConfirm && (
          <label className="adm-type-confirm">
            <span>
              Gõ <b>{s.typeToConfirm}</b> để xác nhận
            </span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        )}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Huỷ
        </button>
        <button
          type="button"
          className={cn('btn btn-danger', busy && 'is-loading')}
          disabled={locked || busy}
          onClick={async () => {
            if (!s) return;
            setBusy(true);
            try {
              await s.run();
              onClose();
            } catch {
              // The caller already showed what went wrong.
            } finally {
              setBusy(false);
            }
          }}
        >
          {s?.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────── misc ─────────────────────────────── */

export function Swatch({ color }: { color: string }) {
  return <span className="adm-swatch" style={{ background: color }} aria-hidden />;
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
