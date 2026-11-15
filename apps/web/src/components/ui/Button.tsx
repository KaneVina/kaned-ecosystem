import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(45,32,121,0.35),0_4px_12px_-4px_rgba(68,51,180,0.45)] hover:bg-brand-600',
  secondary: 'bg-paper text-ink border border-line-2 shadow-xs hover:bg-paper-2 hover:border-[#c9c5d8]',
  ghost: 'text-ink-2 hover:bg-sunk hover:text-ink',
  soft: 'bg-brand-50 text-brand-600 hover:bg-brand-100',
  danger: 'bg-danger text-white hover:bg-[#b5322a]',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-sm',
  md: 'h-10 px-4 text-sm gap-2 rounded',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-md',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconEnd, block, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex items-center justify-center font-semibold whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'active:translate-y-px active:scale-[0.985] disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {!loading && icon}
      {children}
      {!loading && iconEnd}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = 'md', className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid place-items-center rounded transition-colors',
        size === 'sm' ? 'size-8' : 'size-9',
        active ? 'bg-brand-50 text-brand' : 'text-ink-2 hover:bg-sunk hover:text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
