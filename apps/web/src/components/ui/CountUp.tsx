import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts from the last shown value to `value` (from 0 the first time), so a
 * number visibly settles instead of popping in. Text stays the final value
 * for screen readers.
 */
export function CountUp({ value, decimals = 0, durationMs = 900 }: { value: number; decimals?: number; durationMs?: number }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(reduced() ? value : 0);

  useEffect(() => {
    if (reduced()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, durationMs]);

  return (
    <span className="countup" aria-label={value.toFixed(decimals)}>
      <span aria-hidden>{shown.toFixed(decimals)}</span>
    </span>
  );
}
