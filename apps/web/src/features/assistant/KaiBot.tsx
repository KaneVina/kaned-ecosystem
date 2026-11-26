import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { Mood } from './brain';
import { forks, jag, reducedMotion, rnd, strike, type Pt } from './bolt';

export type BotMood = Mood | 'sleep' | 'listen';

/**
 * Kai: a cobalt robot with Kaned's lightning bolt for an antenna, circuit traces on its shell
 * and a glass visor that scans. It blinks, follows the pointer with its eyes, changes face with
 * its mood, and every few seconds a bolt of lightning cracks through it, like the bolt that
 * runs through the KANED logo.
 *
 * zap: strike now and then by itself. zapKey: strike whenever it changes (a new answer).
 * onZap: called as a strike starts, so the frame around Kai can join in.
 */
export function KaiBot({
  mood = 'idle',
  size = 56,
  track = true,
  zap = false,
  zapKey,
  onZap,
  className,
}: {
  mood?: BotMood;
  size?: number;
  track?: boolean;
  zap?: boolean;
  zapKey?: number;
  onZap?: () => void;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const root = useRef<SVGSVGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const zapG = useRef<SVGGElement>(null);
  const busy = useRef(false);
  const onZapRef = useRef(onZap);
  onZapRef.current = onZap;
  const [blink, setBlink] = useState(false);
  const [charged, setCharged] = useState(false);

  // Blink at random, sometimes twice.
  useEffect(() => {
    if (mood === 'sleep' || reducedMotion()) return;
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
    if (!track || reducedMotion()) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const step = () => {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      eyes.current?.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy.toFixed(2)})`);
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.02 ? requestAnimationFrame(step) : 0;
    };
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
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [track]);

  /** One bolt: from the antenna tip, down into the shell, zigzagging across the visor and out past an ear. */
  const fire = useCallback(() => {
    const g = zapG.current;
    if (!g || busy.current || reducedMotion() || mood === 'sleep') return;
    busy.current = true;
    const ltr = Math.random() < 0.5;
    const xs = ltr ? [15, 25, 39, 50] : [50, 39, 25, 15];
    const way: Pt[] = [
      [32 + rnd(-1, 1), -4],
      [32 + rnd(-2, 2), 10],
      [xs[0]!, rnd(21, 27)],
      [xs[1]!, rnd(36, 45)],
      [xs[2]!, rnd(21, 28)],
      [xs[3]!, rnd(37, 45)],
      [ltr ? 61 : 3, rnd(30, 36)],
      [ltr ? 72 : -8, rnd(26, 40)],
    ];
    const main = jag(way, 0.2, 2);
    setCharged(true);
    onZapRef.current?.();
    void strike(g, main, { run: 620, branches: forks(main, Math.random() < 0.6 ? 2 : 1, 11), widths: { glow: 4.6, core: 1.8, hot: 0.75 }, filter: `url(#kz${uid})` }).then(() => {
      busy.current = false;
    });
    setTimeout(() => setCharged(false), 760);
  }, [mood, uid]);

  // Now and then, while Kai is on screen and the tab is in front.
  useEffect(() => {
    if (!zap || reducedMotion()) return;
    let seen = true;
    let t: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(([e]) => {
      seen = Boolean(e?.isIntersecting);
    });
    if (root.current) io.observe(root.current);
    const loop = (wait: number) => {
      t = setTimeout(() => {
        if (seen && !document.hidden) fire();
        loop(rnd(5600, 9000));
      }, wait);
    };
    loop(rnd(1400, 2800));
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, [zap, fire]);

  // And right away when told to (a new answer arrived).
  const firstKey = useRef(zapKey);
  useEffect(() => {
    if (zapKey === undefined || zapKey === firstKey.current) return;
    fire();
  }, [zapKey, fire]);

  const happy = mood === 'happy' || mood === 'wave';
  const closed = mood === 'sleep';
  return (
    <svg
      ref={root}
      className={cn('kai-bot', `is-${mood}`, blink && 'is-blink', charged && 'is-charged', className)}
      width={size}
      height={size}
      viewBox="-6 -8 76 78"
      role="img"
      aria-label="Kai"
    >
      <defs>
        <linearGradient id={`kh${uid}`} x1="0" y1="0" x2=".85" y2="1">
          <stop offset="0" stopColor="#5A80FF" />
          <stop offset=".45" stopColor="#2448D8" />
          <stop offset="1" stopColor="#0F2270" />
        </linearGradient>
        <linearGradient id={`kf${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0C1850" />
          <stop offset="1" stopColor="#050B2A" />
        </linearGradient>
        <linearGradient id={`ks${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7FE3FF" stopOpacity="0" />
          <stop offset=".5" stopColor="#7FE3FF" stopOpacity=".28" />
          <stop offset="1" stopColor="#7FE3FF" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`ke${uid}`} cx=".5" cy=".4" r=".7">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".55" stopColor="#CFF6FF" />
          <stop offset="1" stopColor="#5FD8FF" />
        </radialGradient>
        <radialGradient id={`kc${uid}`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#7FE3FF" stopOpacity=".55" />
          <stop offset="1" stopColor="#7FE3FF" stopOpacity="0" />
        </radialGradient>
        <pattern id={`kp${uid}`} width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r=".35" fill="#7FE3FF" opacity=".35" />
        </pattern>
        <clipPath id={`kv${uid}`}>
          <rect x="12.5" y="20" width="39" height="28" rx="10" />
        </clipPath>
        <filter id={`kg${uid}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`kz${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* energy behind Kai, bright for a beat when lightning hits */}
      <circle className="kai-aura" cx="32" cy="32" r="34" fill={`url(#kc${uid})`} />

      <g className="kai-body">
        {/* antenna: Kaned's bolt on a mast with a node */}
        <g className="kai-antenna">
          <path d="M32 12 V4.5" stroke="#0F2270" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="32" cy="5" r="1.6" fill="#7FE3FF" className="kai-node" />
          <path className="kai-bolt" d="M34.6 -6.2 L28.6 1.6 H32.4 L30.2 7.8 L36.4 -0.2 H32.6 Z" fill="#FFB547" stroke="#E08A00" strokeWidth=".6" strokeLinejoin="round" filter={`url(#kg${uid})`} />
        </g>
        {/* ear modules with level LEDs */}
        <rect x="0.5" y="23.5" width="8" height="18" rx="3.5" fill="#0F2270" />
        <rect x="55.5" y="23.5" width="8" height="18" rx="3.5" fill="#0F2270" />
        {[0, 1, 2].map((i) => (
          <g key={i} className="kai-led" style={{ animationDelay: `${i * 0.18}s` }}>
            <rect x="3" y={27.2 + i * 4} width="3" height="2.2" rx="1" fill="#7FE3FF" />
            <rect x="58" y={27.2 + i * 4} width="3" height="2.2" rx="1" fill="#7FE3FF" />
          </g>
        ))}
        {/* shell */}
        <rect x="6" y="11" width="52" height="44" rx="16" fill={`url(#kh${uid})`} />
        <rect x="6.6" y="11.6" width="50.8" height="42.8" rx="15.4" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth=".9" />
        <path d="M17 15.2 Q32 11.4 47 15.2" stroke="rgba(255,255,255,.5)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        {/* circuit traces with data running through them */}
        <g className="kai-traces" stroke="#8FE9FF" strokeWidth=".75" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path className="kai-trace" d="M19 13.4 V16.6 H13.4 V22" />
          <path className="kai-trace is-b" d="M45 13.4 V16.6 H50.6 V22" />
          <path className="kai-trace is-c" d="M20 52.4 V50.2 H27 M44 52.4 V50.2 H37" />
        </g>
        <g fill="#BFF3FF">
          <circle cx="13.4" cy="22" r=".9" />
          <circle cx="50.6" cy="22" r=".9" />
          <circle cx="27" cy="50.2" r=".8" />
          <circle cx="37" cy="50.2" r=".8" />
        </g>
        {/* visor: dark glass, dot grid, a scan line */}
        <rect x="12.5" y="20" width="39" height="28" rx="10" fill={`url(#kf${uid})`} />
        <g clipPath={`url(#kv${uid})`}>
          <rect x="12.5" y="20" width="39" height="28" fill={`url(#kp${uid})`} />
          <rect className="kai-scan" x="12.5" y="14" width="39" height="7" fill={`url(#ks${uid})`} />
          <rect className="kai-flash" x="12.5" y="20" width="39" height="28" fill="#9FEFFF" opacity="0" />
          <path d="M15 22.5 Q22 20.8 30 21.4" stroke="rgba(255,255,255,.18)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </g>
        <rect x="12.5" y="20" width="39" height="28" rx="10" fill="none" stroke="rgba(127,227,255,.4)" strokeWidth=".9" />

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
        <circle cx="17.6" cy="41" r="1.4" fill="#FF8FB1" opacity={happy ? 0.6 : 0.32} />
        <circle cx="46.4" cy="41" r="1.4" fill="#FF8FB1" opacity={happy ? 0.6 : 0.32} />

        {/* waving hand */}
        {mood === 'wave' && (
          <g className="kai-hand">
            <path d="M56 50 Q62 47 63 41" stroke="#0F2270" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            <circle cx="63.4" cy="39.2" r="3.6" fill="#2448D8" stroke="#0F2270" strokeWidth="1" />
          </g>
        )}
      </g>

      {/* the lightning lives above everything */}
      <g ref={zapG} className="kai-zap" />

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
