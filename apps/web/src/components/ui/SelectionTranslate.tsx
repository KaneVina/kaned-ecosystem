import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Copy, Languages, RefreshCw, X } from 'lucide-react';
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

interface Sel {
  text: string;
  x: number; // anchor, viewport coordinates
  top: number;
  bottom: number;
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
  return !el || Boolean(el.closest('input, textarea, select, [contenteditable="true"], [data-no-translate], .tr-pop, .tr-btn'));
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
  return { text, x: last.right, top: all.top, bottom: last.bottom };
}

export function SelectionTranslate() {
  const enabled = useTranslateEnabled();
  const toast = useToast();
  const [sel, setSel] = useState<Sel | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();

  // Show the "Dịch" button once a selection settles (after mouse-up, or when touch handles stop moving).
  useEffect(() => {
    if (!enabled) {
      setSel(null);
      setOpen(false);
      return;
    }
    const check = (delay: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const next = readSelection();
        setSel((prev) => {
          if (next && prev && prev.text === next.text) return { ...next };
          if (!next && prev && open) return prev; // keep the card while it is open
          return next;
        });
        if (next) setOpen((o) => (o && sel && sel.text === next.text ? o : false));
      }, delay);
    };
    const onUp = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.tr-pop, .tr-btn')) return;
      check(10);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSel(null);
      } else if (e.shiftKey) check(30);
    };
    const onChange = () => {
      if (!window.getSelection()?.toString()) check(120);
      else check(450);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, open]);

  // Close when the person clicks elsewhere or scrolls the selection away.
  useEffect(() => {
    if (!sel) return;
    const onDown = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.tr-pop, .tr-btn')) return;
      setOpen(false);
      if (!window.getSelection()?.toString()) setSel(null);
    };
    const onScroll = () => {
      const s = readSelection();
      if (s) setSel(s);
      else if (!open) setSel(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [sel, open]);

  const disable = useCallback(() => {
    setTranslateEnabled(false);
    setOpen(false);
    setSel(null);
    toast.success('Đã tắt dịch khi bôi đen', 'Bật lại trong Cài đặt tài khoản.');
  }, [toast]);

  if (!enabled || !sel) return null;
  return createPortal(
    open ? <Card sel={sel} onClose={() => setOpen(false)} onDisable={disable} /> : <Trigger sel={sel} onOpen={() => setOpen(true)} />,
    document.body,
  );
}

function place(sel: Sel, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(10, Math.min(sel.x - w / 2, vw - w - 10));
  const below = sel.bottom + 10;
  const top = below + h > vh - 10 && sel.top - h - 10 > 10 ? sel.top - h - 10 : Math.max(10, Math.min(below, vh - h - 10));
  return { left, top };
}

function Trigger({ sel, onOpen }: { sel: Sel; onOpen: () => void }) {
  const { left, top } = place(sel, 84, 38);
  return (
    <button
      type="button"
      className="tr-btn"
      style={{ left, top }}
      // Keep the selection alive while pressing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onOpen}
    >
      <Languages className="ic ic-sm" />
      Dịch
    </button>
  );
}

function Card({ sel, onClose, onDisable }: { sel: Sel; onClose: () => void; onDisable: () => void }) {
  const [to, setTo] = useState<Lang>(VI.test(sel.text) ? 'en' : 'vi');
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: 0 });

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
    if (el) setPos(place(sel, el.offsetWidth, el.offsetHeight));
  }, [sel, res, err]);

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

  const from = res?.from ?? (to === 'vi' ? 'en' : 'vi');
  const target = res?.to ?? to;
  return (
    <div ref={ref} className="tr-pop" role="dialog" aria-label="Dịch đoạn đã chọn" style={pos} onMouseDown={(e) => e.stopPropagation()}>
      <div className="tr-head">
        <span className="tr-langs">
          <Languages className="ic ic-sm" />
          {langName(from)}
          <ArrowRight className="ic ic-sm" />
          <b>{langName(target)}</b>
        </span>
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
          <p className="tr-text" lang={res.to}>
            {res.text}
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
          {copied ? <Check className="ic ic-sm" /> : <Copy className="ic ic-sm" />}
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
  );
}
