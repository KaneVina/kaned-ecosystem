import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Copy, GripHorizontal, Languages, RefreshCw, X } from 'lucide-react';
import { http, toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { setTranslateEnabled, useTranslateEnabled } from '@/lib/translatePref';
import { useToast } from '@/providers/ToastProvider';

type Lang = 'vi' | 'en';
const NAME: Record<string, string> = { vi: 'Tiếng Việt', en: 'Tiếng Anh', ja: 'Tiếng Nhật', ko: 'Tiếng Hàn', zh: 'Tiếng Trung', 'zh-CN': 'Tiếng Trung', fr: 'Tiếng Pháp', de: 'Tiếng Đức', es: 'Tiếng Tây Ban Nha', ru: 'Tiếng Nga' };
const langName = (c: string) => NAME[c] ?? c.toUpperCase();
const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const MIN = 2;
const MAX = 1500;

interface Box {
  l: number;
  t: number;
  w: number;
  h: number;
}
interface Sel {
  text: string;
  x: number; // anchor, viewport coordinates
  top: number;
  bottom: number;
  /** Line boxes of the selected text, to light it up while the card is pointed at. */
  rects: Box[];
}
interface Result {
  text: string;
  from: string;
  to: string;
}

const cache = new Map<string, Result>();

async function request(text: string, to: Lang, signal: AbortSignal): Promise<Result> {
  const key = `${to}\n${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let res = (await http.post<Result>('/translate', { text, to }, { signal })).data;
  // The text was already in the target language: show the other direction instead.
  if (res.from === to) {
    const other: Lang = to === 'vi' ? 'en' : 'vi';
    res = (await http.post<Result>('/translate', { text, to: other }, { signal })).data;
  }
  cache.set(key, res);
  if (cache.size > 100) cache.delete(cache.keys().next().value as string);
  return res;
}

function skip(node: Node | null) {
  const el = node instanceof Element ? node : node?.parentElement;
  return !el || Boolean(el.closest('input, textarea, select, [contenteditable="true"], [data-no-translate], .tr-pop'));
}

function readSelection(): Sel | null {
  const s = window.getSelection();
  if (!s || s.isCollapsed || s.rangeCount === 0) return null;
  const text = s.toString().replace(/\s+/g, ' ').trim();
  if (text.length < MIN || text.length > MAX || !/\p{L}/u.test(text)) return null;
  if (skip(s.anchorNode) || skip(s.focusNode)) return null;
  const range = s.getRangeAt(0);
  const rects = range.getClientRects();
  const last = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  const all = range.getBoundingClientRect();
  if (!last.width && !last.height) return null;
  const boxes = [...rects]
    .filter((r) => r.width > 1 && r.height > 1)
    .slice(0, 40)
    .map((r) => ({ l: r.left, t: r.top, w: r.width, h: r.height }));
  return { text, x: last.right, top: all.top, bottom: last.bottom, rects: boxes };
}

export function SelectionTranslate() {
  const enabled = useTranslateEnabled();
  const toast = useToast();
  const [sel, setSel] = useState<Sel | null>(null);
  const timer = useRef<number>();

  // Translate as soon as a selection settles (after mouse-up, or when touch handles stop moving).
  // Selection events only ever open or move the card; closing is an explicit act (outside click, Esc, ×),
  // so clicking inside the card never makes it vanish.
  useEffect(() => {
    if (!enabled) {
      setSel(null);
      return;
    }
    const check = (delay: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const next = readSelection();
        if (next) setSel((prev) => (prev && prev.text === next.text && prev.x === next.x && prev.bottom === next.bottom && prev.top === next.top ? prev : next));
      }, delay);
    };
    const onUp = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.tr-pop')) return;
      check(10);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
      else if (e.shiftKey) check(30);
    };
    const onChange = () => {
      if (window.getSelection()?.toString()) check(450);
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    document.addEventListener('keyup', onKey);
    document.addEventListener('selectionchange', onChange);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('keyup', onKey);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [enabled]);

  useEffect(() => {
    if (!sel) return;
    const onDown = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.tr-pop')) return;
      window.clearTimeout(timer.current);
      setSel(null);
    };
    // Follow the selection while the page scrolls under it.
    const onScroll = () => {
      const s = readSelection();
      if (s) setSel((prev) => (prev && prev.text === s.text ? s : prev));
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [sel]);

  const disable = useCallback(() => {
    setTranslateEnabled(false);
    setSel(null);
    toast.success('Đã tắt dịch khi bôi đen', 'Bật lại trong Cài đặt tài khoản.');
  }, [toast]);

  if (!enabled || !sel) return null;
  return createPortal(<Card key={sel.text} sel={sel} onClose={() => setSel(null)} onDisable={disable} />, document.body);
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where the card goes: under the selection if it fits, else above; the tail points at the selection's end. */
function place(sel: Sel, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = clamp(sel.x - w / 2, 10, vw - w - 10);
  const below = sel.bottom + 12;
  const above = below + h > vh - 10 && sel.top - h - 12 > 10;
  const top = above ? sel.top - h - 12 : clamp(below, 10, vh - h - 10);
  return { left, top, above, tail: clamp(sel.x - left, 22, w - 22) };
}

/** Splits a translation into words so they can fade in one after another. */
function Words({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  let i = 0;
  return (
    <>
      {parts.map((w, k) =>
        /^\s+$/.test(w) || !w ? (
          w
        ) : (
          <span key={k} className="tr-w" style={{ '--d': `${Math.min(520, i++ * 16)}ms` } as CSSProperties}>
            {w}
          </span>
        ),
      )}
    </>
  );
}

function Card({ sel, onClose, onDisable }: { sel: Sel; onClose: () => void; onDisable: () => void }) {
  const [to, setTo] = useState<Lang>(VI.test(sel.text) ? 'en' : 'vi');
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState({ left: -9999, top: 0, above: false, tail: 40 });
  /** Where the learner dragged the card to; null while it stays by the selection. */
  const [moved, setMoved] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [returning, setReturning] = useState(false);
  const [hover, setHover] = useState(false);
  const lastTap = useRef(0);
  const drag = useRef<{ dx: number; dy: number; from: { left: number; top: number } | null; at: { left: number; top: number } } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setRes(null);
    setErr('');
    request(sel.text, to, ac.signal)
      .then(setRes)
      .catch((e) => {
        if (!ac.signal.aborted) setErr(toApiError(e).message);
      });
    return () => ac.abort();
  }, [sel.text, to, tick]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setGeo(place(sel, el.offsetWidth, el.offsetHeight));
  }, [sel, res, err]);

  // The card fades back while the mouse is off reading elsewhere, and comes forward as it nears.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = Math.hypot(dx, dy);
      el.style.setProperty('--near', String(drag.current ? 1 : clamp(1 - (d - 60) / 220, 0, 1)));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  const copy = async () => {
    if (!res) return;
    try {
      await navigator.clipboard.writeText(res.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };

  /* light that follows the mouse across the card */
  const onLight = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  /* drag by the header; double-click it to send the card back to the selection */
  const onGrab = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, from: moved, at: { left: r.left, top: r.top } };
    e.currentTarget.setPointerCapture(e.pointerId);
    el.style.setProperty('--near', '1');
    // Hold the card where it is, so a re-render mid-drag cannot pull it back to the selection.
    setMoved({ left: r.left, top: r.top });
    setDragging(true);
  };
  const onDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!drag.current || !el) return;
    const left = clamp(e.clientX - drag.current.dx, 6, window.innerWidth - el.offsetWidth - 6);
    const top = clamp(e.clientY - drag.current.dy, 6, window.innerHeight - el.offsetHeight - 6);
    drag.current.at = { left, top };
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };
  const onDrop = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    const start = d.from ?? geo;
    const still = Math.abs(d.at.left - start.left) <= 3 && Math.abs(d.at.top - start.top) <= 3;
    // A click on the header without moving is not a move; two quick ones send the card home.
    // (Handled here: preventDefault on pointerdown keeps the browser from firing dblclick.)
    if (still && d.from && Date.now() - lastTap.current < 350) {
      lastTap.current = 0;
      setReturning(true);
      setMoved(null);
      window.setTimeout(() => setReturning(false), 420);
      return;
    }
    if (still) lastTap.current = Date.now();
    setMoved(still ? d.from : d.at);
  };

  const from = res?.from ?? (to === 'vi' ? 'en' : 'vi');
  const target = res?.to ?? to;
  const pos = moved ?? geo;
  return (
    <>
      {/* The selected words light up while the card is pointed at, so it is clear what is being translated. */}
      <div className={cn('tr-hl', (hover || dragging) && 'is-on')} aria-hidden>
        {sel.rects.map((b, i) => (
          <span key={i} style={{ left: b.l, top: b.t, width: b.w, height: b.h }} />
        ))}
      </div>
      <div
        ref={ref}
        className={cn('tr-pop', geo.above ? 'is-above' : 'is-below', moved && 'is-moved', dragging && 'is-drag', returning && 'is-return', hover && 'is-hover')}
        role="dialog"
        aria-label="Dịch đoạn đã chọn"
        data-pfx="soft"
        style={{ left: pos.left, top: pos.top, '--tail': `${geo.tail}px`, '--oy': geo.above ? '100%' : '0%' } as CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={() => setHover(false)}
        onPointerMove={onLight}
      >
        <span className="tr-tail" aria-hidden />
        <div
          className="tr-head"
          onPointerDown={onGrab}
          onPointerMove={onDrag}
          onPointerUp={onDrop}
          onPointerCancel={onDrop}
          title={moved ? 'Kéo để di chuyển · bấm đúp để đưa về chỗ chữ đã chọn' : 'Kéo để di chuyển'}
        >
          <span className="tr-langs">
            <Languages className="ic ic-sm" />
            {langName(from)}
            <ArrowRight className="ic ic-sm" />
            <b>{langName(target)}</b>
          </span>
          <GripHorizontal className="ic ic-sm tr-grip" aria-hidden />
          <button type="button" className="tr-x" aria-label="Đóng" onClick={onClose}>
            <X className="ic ic-sm" />
          </button>
        </div>
        <p className="tr-src">{sel.text}</p>
        <div className="tr-out" aria-live="polite">
          {err ? (
            <div className="tr-err">
              <span>{err}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTick((t) => t + 1)}>
                <RefreshCw className="ic ic-sm" />
                Thử lại
              </button>
            </div>
          ) : res ? (
            <p key={`${res.to}${res.text}`} className={cn('tr-text', copied && 'is-flash')} lang={res.to}>
              <Words text={res.text} />
            </p>
          ) : (
            <div className="tr-skel" aria-label="Đang dịch">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        <div className="tr-foot">
          <button type="button" className={cn('tr-act', copied && 'is-done')} onClick={copy} disabled={!res}>
            {copied ? <Check key="ok" className="ic ic-sm tr-pop-ic" /> : <Copy className="ic ic-sm" />}
            {copied ? 'Đã chép' : 'Chép bản dịch'}
          </button>
          <button type="button" className="tr-act" onClick={() => setTo(target === 'vi' ? 'en' : 'vi')} disabled={!res}>
            Đổi chiều
          </button>
          <span className="spacer" />
          <button type="button" className="tr-off" onClick={onDisable}>
            Tắt
          </button>
        </div>
      </div>
    </>
  );
}
