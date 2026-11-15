import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  leaving?: boolean;
}

interface ToastContextValue {
  toast: (input: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const ICON: Record<ToastTone, typeof Info> = { success: CircleCheck, error: CircleAlert, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Play the leave animation, then remove.
  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 220);
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-2), { ...input, id }]);
      window.setTimeout(() => dismiss(id), input.tone === 'error' ? 6500 : 4200);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-region" aria-live="polite">
          {toasts.map((t) => {
            const Icon = ICON[t.tone];
            return (
              <div key={t.id} className={cn('toast', `toast-${t.tone}`, t.leaving && 'leaving')} role={t.tone === 'error' ? 'alert' : 'status'}>
                <span className="toast-ic">
                  <Icon className="ic" />
                </span>
                <div className="toast-body">
                  <p className="toast-title">{t.title}</p>
                  {t.description && <p className="toast-text">{t.description}</p>}
                </div>
                <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">
                  <X className="ic ic-sm" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
