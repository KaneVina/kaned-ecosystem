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
}

interface ToastContextValue {
  toast: (input: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-2), { ...input, id }]);
      window.setTimeout(() => dismiss(id), input.tone === 'error' ? 6000 : 4200);
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
        <div
          aria-live="polite"
          className="pointer-events-none fixed right-4 bottom-4 z-[130] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2.5"
        >
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = toast.tone === 'success' ? CircleCheck : toast.tone === 'error' ? CircleAlert : Info;
  const tone = {
    success: 'text-[#7BDDB0]',
    error: 'text-[#FF9B91]',
    info: 'text-[#B9B0F5]',
  }[toast.tone];

  return (
    <div
      role="status"
      className="animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl bg-[#1E1B30] p-3.5 pr-2.5 text-white shadow-lg"
    >
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-semibold">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-[13px] leading-snug text-white/70">{toast.description}</p>}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Đóng thông báo"
        className="grid size-6 shrink-0 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
