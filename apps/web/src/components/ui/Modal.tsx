import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md' | 'xl';
  footer?: ReactNode;
  /** Render children straight into .modal, without the standard head and body. */
  bare?: boolean;
  className?: string;
  /** Optional: a confirmation can be just a title, a description and buttons. */
  children?: ReactNode;
}

/** .modal-wrap with backdrop, focus trap, Escape to close, and the enter/leave transition. */
export function Modal({ open, onClose, title, description, size = 'md', footer, bare, className, children }: ModalProps) {
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
        panel.current?.focus();
      });
      document.body.classList.add('no-scroll');
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    document.body.classList.remove('no-scroll');
    const t = setTimeout(() => {
      setMounted(false);
      returnTo.current?.focus?.();
    }, 220);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const focusables = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className={cn('modal-wrap', shown && 'open', !open && 'closing')}>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        ref={panel}
        className={cn('modal', `modal-${size}`, bare && 'preview-modal', className)}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' && title ? title : undefined}
        tabIndex={-1}
      >
        {bare ? children : (
        <>
        <div className="modal-head">
          <div>
            <h2 className="t-h3">{title}</h2>
            {description && <p className="modal-desc">{description}</p>}
          </div>
          <button type="button" className="icon-btn modal-x" onClick={onClose} aria-label="Đóng">
            <X className="ic" />
          </button>
        </div>
        {children != null && children !== false && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-foot">{footer}</div>}
        </>
        )}
      </div>
    </div>,
    document.body,
  );
}
