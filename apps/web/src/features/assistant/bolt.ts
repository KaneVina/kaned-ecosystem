/**
 * Lightning for Kai, drawn the way the Kaned logo draws its bolt: a fresh jagged path every
 * time (midpoint displacement between waypoints, with a fork or two), stroked in four layers
 * (afterglow trace, soft glow, core, white-hot centre) and run along its length with a dash.
 */

export type Pt = [number, number];

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Splits each leg in two, nudging the middle sideways; a few rounds make it crackle. */
export function jag(points: Pt[], rough = 0.22, rounds = 3): Pt[] {
  let pts = points;
  for (let r = 0; r < rounds; r++) {
    const out: Pt[] = [pts[0]!];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1]!;
      const [x2, y2] = pts[i]!;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const off = rnd(-1, 1) * len * rough;
      out.push([(x1 + x2) / 2 + (-(y2 - y1) / len) * off, (y1 + y2) / 2 + ((x2 - x1) / len) * off], [x2, y2]);
    }
    pts = out;
  }
  return pts;
}

export const toD = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

/** Short forks leaving the main bolt at an angle. */
export function forks(main: Pt[], count: number, length: number): Pt[][] {
  const out: Pt[][] = [];
  for (let n = 0; n < count; n++) {
    const i = Math.floor(rnd(0.25, 0.8) * (main.length - 1));
    const a = main[i]!;
    const b = main[Math.min(main.length - 1, i + 1)]!;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.05);
    const L = length * rnd(0.6, 1);
    out.push(jag([a, [a[0] + Math.cos(ang) * L * 0.55, a[1] + Math.sin(ang) * L * 0.55], [a[0] + Math.cos(ang) * L, a[1] + Math.sin(ang) * L]], 0.3, 2));
  }
  return out;
}

const NS = 'http://www.w3.org/2000/svg';

/**
 * Runs one strike inside `g`. The group needs no children: the layers are created, animated
 * and removed. `widths` are in the SVG's own units.
 */
export function strike(
  g: SVGGElement,
  main: Pt[],
  opts: { run?: number; branches?: Pt[][]; widths?: { glow: number; core: number; hot: number }; filter?: string } = {},
): Promise<void> {
  const run = opts.run ?? 560;
  const w = opts.widths ?? { glow: 3.6, core: 1.3, hot: 0.5 };
  const made: SVGPathElement[] = [];
  const anims: Animation[] = [];
  const layer = (d: string, cls: string, width: number, filter?: string) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-width', String(width));
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    if (filter) p.setAttribute('filter', filter);
    g.appendChild(p);
    made.push(p);
    return p;
  };
  const runAlong = (p: SVGPathElement, duration: number, delay = 0) => {
    const L = p.getTotalLength();
    const seg = Math.max(8, L * 0.36);
    p.style.strokeDasharray = `${seg} ${L + seg}`;
    anims.push(
      p.animate(
        [
          { strokeDashoffset: seg, opacity: 0 },
          { opacity: 1, offset: 0.06 },
          { opacity: 1, offset: 0.88 },
          { strokeDashoffset: -L, opacity: 0 },
        ],
        { duration, delay, easing: 'cubic-bezier(.35,.05,.4,1)', fill: 'both' },
      ),
    );
  };

  const d = toD(main);
  const trace = layer(d, 'z-trace', w.core * 0.6);
  anims.push(trace.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 0.32, offset: 0.66 }, { opacity: 0 }], { duration: run + 320, easing: 'ease-out', fill: 'both' }));
  runAlong(layer(d, 'z-glow', w.glow, opts.filter), run);
  runAlong(layer(d, 'z-core', w.core), run);
  runAlong(layer(d, 'z-hot', w.hot), run);
  for (const b of opts.branches ?? []) {
    const bd = toD(b);
    const delay = run * rnd(0.3, 0.55);
    runAlong(layer(bd, 'z-glow', w.glow * 0.7, opts.filter), run * 0.45, delay);
    runAlong(layer(bd, 'z-core', w.core * 0.75), run * 0.45, delay);
  }
  return Promise.allSettled(anims.map((a) => a.finished)).then(() => made.forEach((p) => p.remove()));
}
