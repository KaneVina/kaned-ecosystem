import { useCallback, useEffect, useId, useRef, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';

const KANED = ['K', 'A', 'N', 'E', 'D'];
const ECOSYSTEM = 'ECOSYSTEM'.split('');

const RUN = 900; // ms for the bolt to cross the word
const FIRST = 1200; // ms after the page opens
const EVERY = 6000; // ms between strikes

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * KANED with ECOSYSTEM underneath, spread to the same width. On hover the
 * letters change colour one after another (kaned.css).
 *
 * A bolt of lightning runs through KANED from left to right: in front of K, N
 * and D, behind A and E, so it threads the letters. Each letter flashes as the
 * bolt reaches it, and the line under ECOSYSTEM sparks after it. It runs by
 * itself: shortly after the page opens, then every EVERY ms while the logo is on
 * screen and the tab is in front. The path is drawn fresh each time, so no two
 * strikes look alike. Off with reduced motion.
 */
export function Wordmark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const root = useRef<HTMLSpanElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const back = useRef<SVGSVGElement>(null);
  const front = useRef<SVGSVGElement>(null);
  const busy = useRef(false);

  const strike = useCallback(() => {
    const k = word.current;
    const b = back.current;
    const f = front.current;
    if (!k || !b || !f || busy.current || reduced()) return;
    const box = k.getBoundingClientRect();
    const W = box.width;
    const H = box.height;
    if (W < 10) return;
    busy.current = true;

    const letters = [...k.querySelectorAll<HTMLElement>(':scope > i')];
    const rs = letters.map((l) => {
      const r = l.getBoundingClientRect();
      return { x: r.left - box.left, w: r.width };
    });

    // A zigzag that crosses every letter: down through one, up through the next, with jags in the gaps.
    const pts: Array<[number, number]> = [[-6, H * rnd(0.4, 0.6)]];
    rs.forEach((r, i) => {
      const hi = i % 2 === 0;
      pts.push([r.x + r.w * rnd(0.15, 0.3), H * (hi ? rnd(0.1, 0.28) : rnd(0.72, 0.9))]);
      pts.push([r.x + r.w * rnd(0.55, 0.8), H * (hi ? rnd(0.62, 0.85) : rnd(0.15, 0.38))]);
      const next = rs[i + 1];
      if (next) pts.push([(r.x + r.w + next.x) / 2, H * rnd(0.35, 0.65)]);
    });
    pts.push([W + 6, H * rnd(0.4, 0.6)]);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

    // In front of K, N, D; behind A and E (the letters paint over the back layer).
    const clip = f.querySelector('clipPath');
    if (clip) {
      clip.innerHTML = rs
        .filter((_, i) => i % 2 === 0)
        .map((r) => `<rect x="${(r.x - 1).toFixed(1)}" y="${-H}" width="${(r.w + 2).toFixed(1)}" height="${H * 3}" />`)
        .join('');
    }

    const paths = [...b.querySelectorAll<SVGPathElement>('path'), ...f.querySelectorAll<SVGPathElement>('path')];
    paths.forEach((p) => p.setAttribute('d', d));
    const probe = paths[0];
    const L = probe.getTotalLength();
    const seg = Math.max(28, L * 0.32);
    const anims: Animation[] = [];
    for (const p of paths) {
      if (p.classList.contains('b-trace')) {
        // Afterglow: the whole path shows faintly for an instant, like a flash on the eye.
        p.style.strokeDasharray = 'none';
        anims.push(p.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 0.28, offset: 0.7 }, { opacity: 0 }], { duration: RUN + 260, easing: 'ease-out' }));
        continue;
      }
      p.style.strokeDasharray = `${seg} ${L + seg}`;
      anims.push(
        p.animate(
          [
            { strokeDashoffset: seg, opacity: 0 },
            { opacity: 1, offset: 0.08 },
            { opacity: 1, offset: 0.9 },
            { strokeDashoffset: -L, opacity: 0 },
          ],
          { duration: RUN, easing: 'linear', fill: 'both' },
        ),
      );
    }

    // Each letter lights up as the bolt crosses it: the colour sweeps in from the left exactly where
    // the bolt is, glows for a beat, then fades back to the letter's own ink.
    const steps = 120;
    const at: number[] = [];
    for (let s = 0; s <= steps; s++) at.push(probe.getPointAtLength((L * s) / steps).x);
    const timeAtX = (x: number) => {
      const s = at.findIndex((v) => v >= x);
      const len = (L * (s < 0 ? steps : s)) / steps;
      return (RUN * (len + seg * 0.15)) / (L + seg);
    };
    letters.forEach((l, i) => {
      const lit = l.querySelector<HTMLElement>('.wm-lit');
      const t0 = timeAtX(rs[i].x);
      const t1 = timeAtX(rs[i].x + rs[i].w);
      const sweep = Math.max(70, t1 - t0);
      const hold = 220;
      const fade = 900;
      const total = sweep + hold + fade;
      if (lit) {
        anims.push(
          lit.animate(
            [
              { clipPath: 'inset(-150% 100% -150% -150%)', opacity: 1, easing: 'linear' },
              { clipPath: 'inset(-150% -150% -150% -150%)', opacity: 1, offset: sweep / total },
              { clipPath: 'inset(-150% -150% -150% -150%)', opacity: 1, offset: (sweep + hold) / total, easing: 'cubic-bezier(.25,.6,.3,1)' },
              { clipPath: 'inset(-150% -150% -150% -150%)', opacity: 0 },
            ],
            { duration: total, delay: t0 },
          ),
        );
      }
      // The letter itself lifts a hair while it is lit.
      anims.push(
        l.animate(
          [
            { transform: 'translateY(0)' },
            { transform: 'translateY(-1.5px)', offset: 0.18 },
            { transform: 'translateY(-1.5px)', offset: 0.4 },
            { transform: 'translateY(0)' },
          ],
          { duration: sweep + hold + 420, delay: t0, easing: 'cubic-bezier(.3,.7,.3,1)' },
        ),
      );
    });

    // The line under ECOSYSTEM sparks across once the bolt leaves the word.
    const line = root.current?.querySelector<HTMLElement>('.wm-spark');
    if (line) anims.push(line.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.6 }, { transform: 'scaleX(1)', opacity: 0 }], { duration: 560, delay: RUN * 0.55, easing: 'cubic-bezier(.3,.7,.2,1)' }));

    Promise.allSettled(anims.map((a) => a.finished)).then(() => {
      busy.current = false;
    });
  }, []);

  // Shortly after the page opens, then on a steady beat while the logo is visible.
  useEffect(() => {
    if (reduced()) return;
    let seen = false;
    let timer = 0;
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
    });
    if (root.current) io.observe(root.current);
    const loop = (wait: number) => {
      timer = window.setTimeout(() => {
        if (seen && !document.hidden) strike();
        loop(EVERY);
      }, wait);
    };
    loop(FIRST);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [strike]);

  return (
    <span ref={root} className={cn('brand', className)} aria-label="Kaned Ecosystem">
      <span ref={word} className="wm-k" aria-hidden>
        {KANED.map((c, i) => (
          <i key={i}>
            {c}
            <b className="wm-lit">{c}</b>
          </i>
        ))}
        <svg ref={back} className="wm-bolt wm-bolt-back" aria-hidden>
          <defs>
            <filter id={`${id}-g`} x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur stdDeviation="1.8" />
            </filter>
          </defs>
          <path className="b-trace" />
          <path className="b-glow" filter={`url(#${id}-g)`} />
          <path className="b-core" />
          <path className="b-hot" />
        </svg>
        <svg ref={front} className="wm-bolt wm-bolt-front" aria-hidden>
          <defs>
            <clipPath id={`${id}-c`} />
          </defs>
          <g clipPath={`url(#${id}-c)`}>
            <path className="b-glow" filter={`url(#${id}-g)`} />
            <path className="b-core" />
            <path className="b-hot" />
          </g>
        </svg>
      </span>
      <span className="wm-e" aria-hidden>
        {ECOSYSTEM.map((c, i) => (
          <i key={i} style={{ '--d': i } as CSSProperties}>
            {c}
          </i>
        ))}
        <b className="wm-spark" />
      </span>
    </span>
  );
}
