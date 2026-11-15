import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded bg-paper border text-[14.5px] text-ink transition-[border-color,box-shadow] ' +
  'placeholder:text-ink-4 hover:border-[#c6c2d6] focus:outline-none focus:border-brand ' +
  'focus:shadow-[0_0_0_3px_rgba(68,51,180,0.22)] disabled:bg-sunk disabled:text-ink-4';

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}

/** Label + control + hint/error, so every form in the product reads the same. */
export function Field({ label, hint, error, required, optional, children, className, htmlFor }: FieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
          {label}
          {required && <span className="text-margin">*</span>}
          {optional && <span className="font-normal text-ink-3">(không bắt buộc)</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="flex items-center gap-1.5 text-[12.5px] text-danger">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </span>
      ) : hint ? (
        <span className="text-[12.5px] text-ink-3">{hint}</span>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  icon?: ReactNode;
  sizeVariant?: 'sm' | 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, icon, sizeVariant = 'md', className, ...props },
  ref,
) {
  const height = sizeVariant === 'sm' ? 'h-9' : sizeVariant === 'lg' ? 'h-12 text-[15px]' : 'h-10.5';
  const input = (
    <input
      ref={ref}
      className={cn(
        CONTROL,
        height === 'h-10.5' ? 'h-[42px]' : height,
        icon ? 'pl-10 pr-3' : 'px-3',
        invalid && 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(207,58,49,0.18)]',
        className,
      )}
      {...props}
    />
  );

  if (!icon) return input;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">{icon}</span>
      {input}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  sizeVariant?: 'sm' | 'md';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, sizeVariant = 'md', className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        CONTROL,
        'cursor-pointer appearance-none bg-no-repeat pr-9 pl-3',
        sizeVariant === 'sm' ? 'h-9 text-[13.5px]' : 'h-[42px]',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23807D93' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[position:right_12px_center]",
        invalid && 'border-danger',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(CONTROL, 'min-h-28 resize-y px-3 py-2.5 leading-relaxed', invalid && 'border-danger', className)}
        {...props}
      />
    );
  },
);

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  count?: number;
}

export function Checkbox({ label, count, className, ...props }: CheckboxProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'group flex cursor-pointer items-center gap-2.5 py-1.5 text-sm text-ink-2 select-none hover:text-ink',
        className,
      )}
    >
      <input id={id} type="checkbox" className="peer sr-only" {...props} />
      <span
        className={cn(
          'grid size-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-line-2 bg-paper transition-all',
          'peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:shadow-[0_0_0_3px_rgba(68,51,180,0.22)]',
          'group-hover:border-brand-200',
          'peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-3 scale-50 stroke-white opacity-0 transition-all" fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="tabular text-xs text-ink-4">{count}</span>}
    </label>
  );
}
