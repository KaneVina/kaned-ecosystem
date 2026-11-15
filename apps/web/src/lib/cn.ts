import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class merging in one place. twMerge resolves Tailwind conflicts by letting
 * the last class win, so a component's own `className` can override the
 * defaults baked into a primitive (`w-auto` beating `w-full`, say) instead of
 * depending on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
