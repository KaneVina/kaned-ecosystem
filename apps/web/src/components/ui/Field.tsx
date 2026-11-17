import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  /** Kept for callers; optional fields are no longer labelled. */
  optional?: boolean;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label, control, hint and error stacked the way kaned.css expects. */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('field', error && 'invalid', className)}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="hint">{hint}</p>}
      <p className="error-text" role={error ? 'alert' : undefined}>
        <AlertCircle className="ic ic-xs" aria-hidden />
        {error}
      </p>
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Leading icon; wraps the input in .input-group. */
  icon?: ReactNode;
  sizeVariant?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, sizeVariant = 'md', invalid, className, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn('input', sizeVariant === 'sm' && 'input-sm', sizeVariant === 'lg' && 'input-lg', className)}
      {...rest}
    />
  );
  if (!icon) return input;
  return (
    <div className="input-group">
      {icon}
      {input}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  sizeVariant?: 'sm' | 'md';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { sizeVariant = 'md', className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn('select', sizeVariant === 'sm' && 'select-sm', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn('textarea', className)} {...rest} />;
});

const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  count?: number;
  /** Greyed out when nothing matches and it is not selected. */
  zero?: boolean;
  type?: 'checkbox' | 'radio';
}

export function Checkbox({ label, count, zero, type = 'checkbox', className, ...rest }: CheckboxProps) {
  return (
    <label className={cn('check', zero && !rest.checked && 'is-zero', className)}>
      <input type={type} {...rest} />
      <span className="box">
        <Tick />
      </span>
      <span className="check-l">{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </label>
  );
}
