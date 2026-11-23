import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * One box per digit, the usual OTP behaviour: typing moves forward, Backspace
 * steps back, arrows move, a pasted code fills every box, and a one-time-code
 * autofill from the phone lands in the first box and spreads out.
 */
export function OtpBoxes({
  value,
  onChange,
  onComplete,
  length = 6,
  invalid,
  disabled,
  autoFocus,
  label = 'Mã OTP',
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focus = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  };
  const commit = (next: string, at: number) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) {
      refs.current[length - 1]?.blur();
      onComplete?.(clean);
    } else focus(at);
  };

  return (
    <div className={cn('vec-otp', invalid && 'is-bad')} role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={cn('vec-otp-box', d && 'is-filled')}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`${label}, chữ số ${i + 1}`}
          maxLength={length}
          value={d}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, '');
            if (!typed) return;
            // Several digits at once (autofill or fast typing): spread them from this box.
            const next = (value.slice(0, i) + typed + value.slice(i + 1)).slice(0, length);
            commit(next, i + typed.length);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (d) onChange(value.slice(0, i) + value.slice(i + 1));
              else if (i > 0) {
                onChange(value.slice(0, i - 1) + value.slice(i));
                focus(i - 1);
              }
            } else if (e.key === 'Delete') {
              e.preventDefault();
              onChange(value.slice(0, i) + value.slice(i + 1));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              focus(i - 1);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              focus(i + 1);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text').replace(/\D/g, '');
            if (!text) return;
            e.preventDefault();
            commit(text, Math.min(text.length, length - 1));
          }}
        />
      ))}
    </div>
  );
}
