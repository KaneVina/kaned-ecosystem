import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { usePointerFxEnabled } from '@/lib/pointerFxPref';

/** Things you can press: the ring wraps them. */
const PRESSABLE = [
  'a[href]',
  'button:not(:disabled)',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="checkbox"]',
  'summary',
  'select',
  'label[for]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="range"]',
  'input[type="file"]',
  'input[type="submit"]',
  'input[type="button"]',
  '[data-pfx="press"]',
].join(',');
/** Places where you type or that own the pointer: the ring steps aside. */
const AWAY = [
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="submit"]):not([type="button"])',
  'textarea',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  'iframe',
  'video',
  'canvas',
  '[data-pfx="off"]',
].join(',');
/** Pages where nothing should move around the pointer. */
const QUIET_ROUTES = [/^\/app\/vec\/room\//];

const FREE = 26; // ring size when nothing is under it
const BIG = 44; // over a large pressable area (a whole card)
const PAD = 5; // space between a button and the ring wrapped around it
const SNAP_MAX_W = 380;
const SNAP_MAX_H = 76;

type Mode = 'free' | 'snap' | 'big' | 'away';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const forcedColors = () => window.matchMedia?.('(forced-colors: active)').matches ?? false;

function radiusOf(el: Element, w: number, h: number) {
  const v = getComputedStyle(el).borderTopLeftRadius;
  const r = v.endsWith('%') ? (Math.min(w, h) * parseFloat(v)) / 100 : parseFloat(v) || 0;
  return Math.min(r + PAD, (h + PAD * 2) / 2);
}

/**
 * Pointer effects for the whole site.
 * Mouse: a soft ring trails the pointer, wraps buttons and links it passes over,
 * swells over larger clickable cards, steps aside over text fields, and pulses on click.
 * Touch and pen: a ripple where the finger lands.
 * The native cursor is never hidden. Off with reduced motion, forced colours, the
 * setting in Cài đặt, or inside an exam room. Runs outside React: one element,
 * transforms only, and the frame loop sleeps when nothing moves.
 */
export function PointerFx() {
  const enabled = usePointerFxEnabled();
  const { pathname } = useLocation();
  const quiet = QUIET_ROUTES.some((r) => r.test(pathname));
  const quietRef = useRef(quiet);
  quietRef.current = quiet;
  const syncRef = useRef<() => void>(() => {});
  useEffect(() => syncRef.current(), [quiet]);

  useEffect(() => {
    if (!enabled || reducedMotion() || forcedColors()) return;

    const layer = document.createElement('div');
    layer.className = 'pfx';
    layer.setAttribute('aria-hidden', 'true');
    const ring = document.createElement('div');
    ring.className = 'pfx-ring is-hidden';
    layer.appendChild(ring);
    document.body.appendChild(layer);

    // pointer, ring now, ring target
    let mx = -100;
    let my = -100;
    const cur = { x: -100, y: -100, w: FREE, h: FREE, r: FREE / 2, s: 1 };
    let mode: Mode = 'free';
    let snapEl: Element | null = null;
    let snapR = 0; // the wrapped element's corner radius, read once per hover
    let seen = false; // a mouse has moved over the page
    let inside = true;
    let pressed = false;
    let dragging = false;
    let downX = 0;
    let downY = 0;
    let needHit = false;
    let raf = 0;
    let last = 0;

    const setClass = () => {
      const hidden = !seen || !inside || mode === 'away' || quietRef.current || document.hidden;
      ring.classList.toggle('is-hidden', hidden);
      ring.classList.toggle('is-snap', mode === 'snap' && !dragging);
      ring.classList.toggle('is-big', mode === 'big' && !dragging);
      ring.classList.toggle('is-down', pressed);
      ring.classList.toggle('is-drag', dragging);
    };

    const classify = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      const prev = snapEl;
      snapEl = null;
      if (!el) mode = 'free';
      else if (el.closest(AWAY)) mode = 'away';
      else {
        const p = el.closest(PRESSABLE);
        // Inside a surface with its own pointer light, only buttons get the ring.
        if (!p) mode = el.closest('[data-pfx="soft"]') ? 'away' : 'free';
        else {
          const r = p.getBoundingClientRect();
          // A card-wide link reaches here through its ::after, so the pointer is outside the link's own box.
          const within = mx >= r.left - 1 && mx <= r.right + 1 && my >= r.top - 1 && my <= r.bottom + 1;
          if (within && r.width <= SNAP_MAX_W && r.height <= SNAP_MAX_H) {
            mode = 'snap';
            if (prev !== p) snapR = radiusOf(p, r.width, r.height);
            snapEl = p;
          } else mode = 'big';
        }
      }
      setClass();
    };

    const frame = (t: number) => {
      raf = 0;
      const dt = Math.min(64, last ? t - last : 16.7);
      last = t;
      if (needHit) {
        needHit = false;
        classify(document.elementFromPoint(mx, my));
      }
      let tx = mx;
      let ty = my;
      let tw = FREE;
      let th = FREE;
      let tr = FREE / 2;
      if (dragging) {
        tw = th = 14;
        tr = 7;
      } else if (mode === 'snap' && snapEl) {
        if (!snapEl.isConnected) {
          mode = 'free';
          snapEl = null;
          setClass();
        } else {
          const r = snapEl.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          // A little pull toward the pointer so the wrap feels attached to it.
          tx = cx + (mx - cx) * 0.12;
          ty = cy + (my - cy) * 0.18;
          tw = r.width + PAD * 2;
          th = r.height + PAD * 2;
          tr = snapR;
        }
      } else if (mode === 'big') {
        tw = th = BIG;
        tr = BIG / 2;
      }
      const ts = pressed ? 0.9 : 1;
      // Frame-rate independent easing: same feel at 60 and 120 Hz.
      const k = (base: number) => 1 - Math.pow(1 - base, dt / 16.7);
      const kp = k(mode === 'snap' ? 0.3 : 0.24);
      const kz = k(0.22);
      cur.x += (tx - cur.x) * kp;
      cur.y += (ty - cur.y) * kp;
      cur.w += (tw - cur.w) * kz;
      cur.h += (th - cur.h) * kz;
      cur.r += (tr - cur.r) * kz;
      cur.s += (ts - cur.s) * k(0.35);
      ring.style.width = `${cur.w}px`;
      ring.style.height = `${cur.h}px`;
      ring.style.borderRadius = `${cur.r}px`;
      ring.style.transform = `translate3d(${cur.x - cur.w / 2}px, ${cur.y - cur.h / 2}px, 0) scale(${cur.s})`;
      const settled =
        Math.abs(tx - cur.x) < 0.1 && Math.abs(ty - cur.y) < 0.1 && Math.abs(tw - cur.w) < 0.1 && Math.abs(th - cur.h) < 0.1 && Math.abs(ts - cur.s) < 0.002;
      // Sleep once everything has arrived; the next move or scroll wakes it.
      if (!settled) kick();
      else last = 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    /* ripples: click pulse for the mouse, tap ripple for touch and pen */
    const pool: HTMLSpanElement[] = [];
    const ripple = (x: number, y: number, kind: 'click' | 'tap', strong: boolean) => {
      let s = pool.pop();
      if (!s) {
        s = document.createElement('span');
        layer.appendChild(s);
      }
      const size = kind === 'click' ? 44 : strong ? 76 : 60;
      s.className = `pfx-ripple is-${kind}${strong ? ' is-strong' : ''}`;
      s.style.width = s.style.height = `${size}px`;
      s.style.left = `${x - size / 2}px`;
      s.style.top = `${y - size / 2}px`;
      const a = s.animate(
        kind === 'click'
          ? [
              { transform: 'scale(.25)', opacity: 0.55 },
              { transform: 'scale(1)', opacity: 0 },
            ]
          : [
              { transform: 'scale(.15)', opacity: 0.9 },
              { transform: 'scale(.75)', opacity: 0.55, offset: 0.45 },
              { transform: 'scale(1)', opacity: 0 },
            ],
        { duration: kind === 'click' ? 420 : 560, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
      const el = s;
      a.onfinish = a.oncancel = () => {
        el.className = 'pfx-ripple';
        if (pool.length < 8) pool.push(el);
        else el.remove();
      };
      return a;
    };
    let tapAnim: Animation | null = null;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX;
      my = e.clientY;
      if (!seen) {
        seen = true;
        cur.x = mx;
        cur.y = my;
        setClass();
      }
      inside = true;
      if (pressed && !dragging && Math.hypot(mx - downX, my - downY) > 6 && mode !== 'snap') {
        dragging = true;
        setClass();
      }
      kick();
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX;
      my = e.clientY;
      classify(e.target);
      kick();
    };
    const onDown = (e: PointerEvent) => {
      if (quietRef.current) return;
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        pressed = true;
        downX = e.clientX;
        downY = e.clientY;
        setClass();
        kick();
        if (mode !== 'away') ripple(e.clientX, e.clientY, 'click', false);
      } else {
        const t = e.target instanceof Element ? e.target : null;
        if (t?.closest(AWAY)) return;
        tapAnim = ripple(e.clientX, e.clientY, 'tap', Boolean(t?.closest(PRESSABLE)));
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pressed = false;
      if (dragging) {
        dragging = false;
        needHit = true;
      }
      setClass();
      kick();
    };
    // The page started scrolling under the finger: the tap was not a tap.
    const onCancel = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && tapAnim) tapAnim.playbackRate = 3;
    };
    const onScroll = () => {
      if (!seen) return;
      needHit = true;
      kick();
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        inside = false;
        setClass();
      }
    };
    const onVis = () => setClass();
    const onBlur = () => {
      pressed = false;
      dragging = false;
      setClass();
    };

    const opts = { passive: true, capture: true } as const;
    window.addEventListener('pointermove', onMove, opts);
    window.addEventListener('pointerover', onOver, opts);
    window.addEventListener('pointerdown', onDown, opts);
    window.addEventListener('pointerup', onUp, opts);
    window.addEventListener('pointercancel', onCancel, opts);
    window.addEventListener('scroll', onScroll, opts);
    document.addEventListener('mouseout', onLeave, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    syncRef.current = setClass;

    return () => {
      cancelAnimationFrame(raf);
      syncRef.current = () => {};
      window.removeEventListener('pointermove', onMove, opts);
      window.removeEventListener('pointerover', onOver, opts);
      window.removeEventListener('pointerdown', onDown, opts);
      window.removeEventListener('pointerup', onUp, opts);
      window.removeEventListener('pointercancel', onCancel, opts);
      window.removeEventListener('scroll', onScroll, opts);
      document.removeEventListener('mouseout', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      layer.remove();
    };
  }, [enabled]);

  return null;
}
