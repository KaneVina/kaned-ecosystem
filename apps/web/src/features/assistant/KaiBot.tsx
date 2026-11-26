import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { Mood } from './brain';

export type BotMood = Mood | 'sleep' | 'listen';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Kai: a small cobalt robot with Kaned's lightning bolt for an antenna. It blinks, follows the
 * pointer with its eyes, and changes face with its mood (thinking, talking, happy, sorry,
 * waving, listening, asleep).
 */
export function KaiBot({ mood = 'idle', size = 56, track = true, className }: { mood?: BotMood; size?: number; track?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const root = useRef<SVGSVGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const [blink, setBlink] = useState(false);

  // Blink at random, sometimes twice.
  useEffect(() => {
    if (mood === 'sleep' || reduced()) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 150);
        if (Math.random() < 0.22) setTimeout(() => (setBlink(true), setTimeout(() => setBlink(false), 140)), 300);
        loop();
      }, 2200 + Math.random() * 4200);
    };
    loop();
    return () => clearTimeout(t);
  }, [mood]);

  // Eyes follow the pointer (a few pixels, eased).
  useEffect(() => {
    if (!track || reduced()) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const onMove = (e: PointerEvent) => {
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 260);
      tx = (dx / d) * 2.6 * k;
      ty = (dy / d) * 1.9 * k;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = () => {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      eyes.current?.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy.toFixed(2)})`);
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [track]);

  const happy = mood === 'happy' || mood === 'wave';
  const closed = mood === 'sleep';
  return (
    <svg
      ref={root}
      className={cn('kai-bot', `is-${mood}`, blink && 'is-blink', className)}
      width={size}
      height={size}
      viewBox="-6 -8 76 78"
      role="img"
      aria-label="Kai"
    >
      <defs>
        <linearGradient id={`kh${uid}`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#4C74FF" />
          <stop offset=".55" stopColor="#2448D8" />
          <stop offset="1" stopColor="#162F96" />
        </linearGradient>
        <linearGradient id={`kf${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0F1C58" />
          <stop offset="1" stopColor="#0A1440" />
        </linearGradient>
        <radialGradient id={`ke${uid}`} cx=".5" cy=".4" r=".7">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".6" stopColor="#CFF4FF" />
          <stop offset="1" stopColor="#7FE3FF" />
        </radialGradient>
        <filter id={`kg${uid}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="kai-body">
        {/* antenna: Kaned's bolt */}
        <g className="kai-antenna">
          <path d="M32 12 V5" stroke="#162F96" strokeWidth="2.4" strokeLinecap="round" />
          <path className="kai-bolt" d="M34.6 -5.6 L28.6 2.2 H32.4 L30.2 8.4 L36.4 0.4 H32.6 Z" fill="#FFB547" stroke="#E08A00" strokeWidth=".6" strokeLinejoin="round" filter={`url(#kg${uid})`} />
        </g>
        {/* ears */}
        <rect x="1.5" y="25" width="7" height="15" rx="3.5" fill="#162F96" />
        <rect x="55.5" y="25" width="7" height="15" rx="3.5" fill="#162F96" />
        <circle className="kai-ear-led" cx="5" cy="32.5" r="1.3" fill="#7FE3FF" />
        <circle className="kai-ear-led" cx="59" cy="32.5" r="1.3" fill="#7FE3FF" />
        {/* head */}
        <rect x="6" y="11" width="52" height="44" rx="17" fill={`url(#kh${uid})`} />
        <path d="M16 15.5 Q32 10.5 48 15.5" stroke="rgba(255,255,255,.45)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        {/* face screen */}
        <rect x="12.5" y="20" width="39" height="28" rx="11" fill={`url(#kf${uid})`} />
        <rect x="12.5" y="20" width="39" height="28" rx="11" fill="none" stroke="rgba(127,227,255,.22)" strokeWidth="1" />

        <g ref={eyes} className="kai-eyes">
          {closed ? (
            <g stroke="#7FE3FF" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <path d="M21 33 Q24.5 35.5 28 33" />
              <path d="M36 33 Q39.5 35.5 43 33" />
            </g>
          ) : happy ? (
            <g stroke={`url(#ke${uid})`} strokeWidth="2.8" strokeLinecap="round" fill="none" filter={`url(#kg${uid})`}>
              <path d="M21 34 Q24.5 28.5 28 34" />
              <path d="M36 34 Q39.5 28.5 43 34" />
            </g>
          ) : (
            <g className="kai-eye-pair" filter={`url(#kg${uid})`}>
              <rect className="kai-eye" x="21.4" y="27.4" width="6.2" height="9.2" rx="3.1" fill={`url(#ke${uid})`} />
              <rect className="kai-eye" x="36.4" y="27.4" width="6.2" height="9.2" rx="3.1" fill={`url(#ke${uid})`} />
              {mood === 'sorry' && (
                <g stroke="#7FE3FF" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M20.5 25.2 L27 26.8" />
                  <path d="M43.5 25.2 L37 26.8" />
                </g>
              )}
            </g>
          )}
        </g>

        {/* mouth */}
        {mood === 'talk' ? (
          <rect className="kai-mouth-talk" x="29" y="39.2" width="6" height="3.6" rx="1.8" fill="#7FE3FF" />
        ) : mood === 'sorry' ? (
          <path d="M28.5 42.5 Q32 39.8 35.5 42.5" stroke="#7FE3FF" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        ) : mood === 'think' ? (
          <path d="M29 41 H35" stroke="#7FE3FF" strokeWidth="1.8" strokeLinecap="round" />
        ) : mood === 'listen' ? (
          <circle cx="32" cy="41" r="2" fill="#7FE3FF" />
        ) : (
          <path d={happy ? 'M27.5 39.6 Q32 44.6 36.5 39.6' : 'M28.5 40 Q32 43.2 35.5 40'} stroke="#7FE3FF" strokeWidth="1.9" strokeLinecap="round" fill="none" />
        )}
        {/* cheeks */}
        <ellipse cx="17.6" cy="40.5" rx="2.6" ry="1.5" fill="#FF8FB1" opacity={happy ? 0.55 : 0.3} />
        <ellipse cx="46.4" cy="40.5" rx="2.6" ry="1.5" fill="#FF8FB1" opacity={happy ? 0.55 : 0.3} />

        {/* waving hand */}
        {mood === 'wave' && (
          <g className="kai-hand">
            <path d="M56 50 Q62 47 63 41" stroke="#162F96" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            <circle cx="63.4" cy="39.2" r="3.6" fill="#2448D8" stroke="#162F96" strokeWidth="1" />
          </g>
        )}
      </g>

      {/* thinking dots / sleep z */}
      {mood === 'think' && (
        <g className="kai-dots" fill="#2448D8">
          <circle cx="55" cy="6" r="2" />
          <circle cx="61" cy="1" r="2.4" />
          <circle cx="67.5" cy="-4" r="2.8" />
        </g>
      )}
      {mood === 'sleep' && (
        <g className="kai-z" fill="#2448D8" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900">
          <text x="54" y="8" fontSize="9">z</text>
          <text x="61" y="0" fontSize="7">z</text>
        </g>
      )}
      {mood === 'listen' && (
        <g className="kai-waves" stroke="#2448D8" strokeWidth="1.8" fill="none" strokeLinecap="round">
          <path d="M-2 26 Q-5 32.5 -2 39" />
          <path d="M66 26 Q69 32.5 66 39" />
        </g>
      )}
    </svg>
  );
}
