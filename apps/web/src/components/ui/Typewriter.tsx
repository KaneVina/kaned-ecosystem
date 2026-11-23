import { useEffect, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Types each phrase, holds it, erases it, then moves to the next. Screen
 * readers get the first phrase once (the parent should carry the full text
 * in aria-label); with reduced motion the first phrase just shows.
 */
export function Typewriter({
  phrases,
  typeMs = 55,
  eraseMs = 28,
  holdMs = 2600,
  startDelayMs = 0,
}: {
  phrases: string[];
  typeMs?: number;
  eraseMs?: number;
  holdMs?: number;
  startDelayMs?: number;
}) {
  const still = reduced();
  const [i, setI] = useState(0);
  const [len, setLen] = useState(still ? phrases[0].length : 0);
  const [phase, setPhase] = useState<'wait' | 'type' | 'hold' | 'erase'>(still ? 'hold' : 'wait');

  useEffect(() => {
    if (still) return;
    const text = phrases[i % phrases.length];
    let t: number;
    if (phase === 'wait') t = window.setTimeout(() => setPhase('type'), startDelayMs);
    else if (phase === 'type') {
      if (len < text.length) t = window.setTimeout(() => setLen(len + 1), typeMs + Math.random() * 40);
      else t = window.setTimeout(() => setPhase(phrases.length > 1 ? 'erase' : 'hold'), holdMs);
    } else if (phase === 'erase') {
      if (len > 0) t = window.setTimeout(() => setLen(len - 1), eraseMs);
      else {
        setI(i + 1);
        setPhase('type');
        return;
      }
    }
    return () => window.clearTimeout(t);
  }, [still, phase, len, i, phrases, typeMs, eraseMs, holdMs, startDelayMs]);

  const text = phrases[i % phrases.length].slice(0, len);
  // The caret travels with the last word (no-break), so it can never wrap onto a line of its own.
  const cut = text.lastIndexOf(' ') + 1;
  return (
    <span className="tw" aria-hidden>
      {text.slice(0, cut)}
      <span className="tw-tail">
        {text.slice(cut)}
        <span className={phase === 'type' || phase === 'erase' ? 'tw-caret is-busy' : 'tw-caret'} />
      </span>
    </span>
  );
}
