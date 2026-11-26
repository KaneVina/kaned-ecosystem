import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fmtMin, type MeetCell } from '@kaned/shared';
import { cn } from '@/lib/cn';

/**
 * The week grid: days across, time down. Two jobs:
 *  - paint: drag a rectangle to mark cells (free, busy, blocked) or erase them. A mouse paints at
 *    once; a finger paints after a short hold, so a quick swipe still scrolls the page, and a tap
 *    toggles one cell. Arrow keys and Space work too.
 *  - heat: the group's overlap, darker where more people are free, with suggestions, the final
 *    time and one person's answers drawn on top.
 */

export type CellState = 'free' | 'busy' | 'blocked' | null;
export type PaintTool = 'free' | 'busy' | 'blocked' | 'erase';

export interface GridCol {
  key: string;
  head: string;
  sub?: string | null;
  start: number;
  end: number;
}

export interface GridOverlay {
  day: string;
  start: number;
  end: number;
  kind: 'suggest' | 'final' | 'hover' | 'flex';
  label?: ReactNode;
}

interface Props {
  cols: GridCol[];
  rows: number[];
  slotMin: number;
  variant: 'paint' | 'heat';
  /** paint: what a cell holds now */
  stateOf?: (day: string, m: number) => CellState;
  tool?: PaintTool;
  onPaint?: (cells: Array<[string, number]>, to: CellState) => void;
  /** cells nobody may paint (the leader's blocked times, for members) */
  lockedOf?: (day: string, m: number) => boolean;
  /** heat */
  heat?: Map<string, MeetCell>;
  total?: number;
  /** One person's answers drawn over the heat (others dimmed). */
  focus?: { free: Set<string>; busy: Set<string> } | null;
  overlays?: GridOverlay[];
  pulse?: Set<string>;
  onHover?: (cell: { day: string; m: number } | null) => void;
  onPick?: (cell: { day: string; m: number }) => void;
  selected?: { day: string; m: number } | null;
  label: string;
  dense?: boolean;
}

const key = (d: string, m: number) => `${d}|${m}`;

/** Sequential cobalt, light to deep: share of people free → background. */
const HEAT = ['#F4F6FD', '#E3EAFF', '#C9D6FF', '#A7BCFF', '#7F9BFA', '#5878F0', '#3A5BE2', '#2448D8', '#1A35AD'];
export const heatColor = (frac: number) => (frac <= 0 ? HEAT[0]! : HEAT[Math.min(HEAT.length - 1, 1 + Math.floor(frac * (HEAT.length - 1.0001)))]!);

export const TimeGrid = memo(function TimeGrid(p: Props) {
  const root = useRef<HTMLDivElement>(null);
  type Drag = { c0: number; r0: number; c1: number; r1: number; to: CellState };
  const [drag, setDragState] = useState<Drag | null>(null);
  // The ref is the truth: a fast release must commit the last cell even before React re-renders.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);
  const hold = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number; c: number; r: number; id: number } | null>(null);
  const [focus, setFocus] = useState<{ c: number; r: number }>({ c: 0, r: 0 });

  const rowH = p.dense ? 15 : p.slotMin === 15 ? 15 : p.slotMin === 60 ? 34 : 22;
  const inWindow = useCallback((c: number, r: number) => {
    const col = p.cols[c];
    const m = p.rows[r];
    return Boolean(col && m != null && m >= col.start && m + p.slotMin <= col.end);
  }, [p.cols, p.rows, p.slotMin]);

  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-c]');
    if (!el || !root.current?.contains(el)) return null;
    return { c: Number(el.dataset.c), r: Number(el.dataset.r) };
  };

  const decide = useCallback((c: number, r: number): CellState => {
    const t = p.tool ?? 'free';
    if (t === 'erase') return null;
    const now = p.stateOf?.(p.cols[c]!.key, p.rows[r]!) ?? null;
    return now === t ? null : t;
  }, [p.tool, p.stateOf, p.cols, p.rows]);

  const commit = useCallback((d: { c0: number; r0: number; c1: number; r1: number; to: CellState }) => {
    const cells: Array<[string, number]> = [];
    for (let c = Math.min(d.c0, d.c1); c <= Math.max(d.c0, d.c1); c++) {
      for (let r = Math.min(d.r0, d.r1); r <= Math.max(d.r0, d.r1); r++) {
        if (!inWindow(c, r)) continue;
        const day = p.cols[c]!.key;
        const m = p.rows[r]!;
        if (p.lockedOf?.(day, m)) continue;
        cells.push([day, m]);
      }
    }
    if (cells.length) p.onPaint?.(cells, d.to);
  }, [inWindow, p]);

  const startDrag = (c: number, r: number) => {
    const d = { c0: c, r0: r, c1: c, r1: r, to: decide(c, r) };
    setDrag(d);
    setFocus({ c, r });
  };

  const onDown = (e: React.PointerEvent) => {
    if (p.variant !== 'paint' || e.button > 0) return;
    last.current = { x: e.clientX, y: e.clientY };
    const hit = cellAt(e.clientX, e.clientY);
    if (!hit || !inWindow(hit.c, hit.r) || p.lockedOf?.(p.cols[hit.c]!.key, p.rows[hit.r]!)) return;
    if (e.pointerType === 'touch') {
      // Hold to paint; a swipe before that scrolls.
      const h = { x: e.clientX, y: e.clientY, c: hit.c, r: hit.r, id: e.pointerId, t: setTimeout(() => {
        hold.current = null;
        navigator.vibrate?.(8);
        startDrag(hit.c, hit.r);
      }, 170) };
      hold.current = h;
      return;
    }
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startDrag(hit.c, hit.r);
  };
  // Painting past the top or bottom of the screen scrolls the page, so a long day fits in one drag.
  const last = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);
  const extend = useCallback(() => {
    const d = dragRef.current;
    const pt = last.current;
    if (!d || !pt) return;
    const hit = cellAt(pt.x, pt.y);
    if (hit && (hit.c !== d.c1 || hit.r !== d.r1)) setDrag({ ...d, c1: hit.c, r1: hit.r });
  }, [setDrag]);
  const edgeScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const step = () => {
      const pt = last.current;
      if (!dragRef.current || !pt) return;
      const top = 120;
      const bottom = window.innerHeight - 70;
      const v = pt.y > bottom ? Math.min(18, (pt.y - bottom) / 3 + 4) : pt.y < top ? -Math.min(18, (top - pt.y) / 3 + 4) : 0;
      if (v) {
        window.scrollBy(0, v);
        extend();
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [extend]);
  useEffect(() => {
    if (drag && !raf.current) edgeScroll();
    if (!drag) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
  }, [drag, edgeScroll]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onMove = (e: React.PointerEvent) => {
    last.current = { x: e.clientX, y: e.clientY };
    const h = hold.current;
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) {
      clearTimeout(h.t);
      hold.current = null;
    }
    extend();
  };
  const onUp = () => {
    const h = hold.current;
    if (h) {
      // A tap: toggle just that cell.
      clearTimeout(h.t);
      hold.current = null;
      commit({ c0: h.c, r0: h.r, c1: h.c, r1: h.r, to: decide(h.c, h.r) });
      setFocus({ c: h.c, r: h.r });
      return;
    }
    const d = dragRef.current;
    if (d) commit(d);
    setDrag(null);
  };

  // While a finger paints, the page must not scroll.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);
  useEffect(() => {
    const up = () => (dragRef.current || hold.current) && onUpRef.current();
    // The browser took the gesture (a scroll): forget the pending hold, keep a started drag.
    const cancel = () => {
      if (hold.current) {
        clearTimeout(hold.current.t);
        hold.current = null;
      }
      if (dragRef.current) onUpRef.current();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);
  const onUpRef = useRef(onUp);
  onUpRef.current = onUp;

  const onKey = (e: React.KeyboardEvent) => {
    const mv: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = mv[e.key];
    if (d) {
      e.preventDefault();
      const c = Math.max(0, Math.min(p.cols.length - 1, focus.c + d[0]));
      const r = Math.max(0, Math.min(p.rows.length - 1, focus.r + d[1]));
      setFocus({ c, r });
      root.current?.querySelector<HTMLElement>(`[data-c="${c}"][data-r="${r}"]`)?.focus();
      if (p.variant === 'heat') p.onHover?.({ day: p.cols[c]!.key, m: p.rows[r]! });
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && inWindow(focus.c, focus.r)) {
      e.preventDefault();
      if (p.variant === 'paint') commit({ c0: focus.c, r0: focus.r, c1: focus.c, r1: focus.r, to: decide(focus.c, focus.r) });
      else p.onPick?.({ day: p.cols[focus.c]!.key, m: p.rows[focus.r]! });
    }
  };

  /** Header or time label: the whole day, or that time on every day. */
  const fillLine = (c: number | null, r: number | null) => {
    const cs = c == null ? p.cols.map((_, i) => i) : [c];
    const rs = r == null ? p.rows.map((_, i) => i) : [r];
    const open: Array<[number, number]> = [];
    for (const ci of cs) for (const ri of rs) if (inWindow(ci, ri) && !p.lockedOf?.(p.cols[ci]!.key, p.rows[ri]!)) open.push([ci, ri]);
    if (!open.length) return;
    const t = p.tool ?? 'free';
    // All already this tool → clear them; otherwise fill.
    const all = t !== 'erase' && open.every(([ci, ri]) => p.stateOf?.(p.cols[ci]!.key, p.rows[ri]!) === t);
    p.onPaint?.(open.map(([ci, ri]) => [p.cols[ci]!.key, p.rows[ri]!]), t === 'erase' || all ? null : t);
  };

  const inDrag = (c: number, r: number) => drag && c >= Math.min(drag.c0, drag.c1) && c <= Math.max(drag.c0, drag.c1) && r >= Math.min(drag.r0, drag.r1) && r <= Math.max(drag.r0, drag.r1);

  const style = { '--cols': p.cols.length, '--row': `${rowH}px` } as CSSProperties;
  const total = p.total ?? 0;
  const rowOf = useMemo(() => new Map(p.rows.map((m, i) => [m, i])), [p.rows]);
  const colOf = useMemo(() => new Map(p.cols.map((c, i) => [c.key, i])), [p.cols]);

  return (
    <div
      ref={root}
      className={cn('tg', `tg-${p.variant}`, drag && 'is-dragging', p.focus && 'has-focus', p.dense && 'is-dense')}
      style={style}
      role="grid"
      aria-label={p.label}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerLeave={() => p.variant === 'heat' && p.onHover?.(null)}
      onKeyDown={onKey}
    >
      <div className="tg-corner" />
      {p.cols.map((c, ci) =>
        p.variant === 'paint' ? (
          <button key={c.key} type="button" className="tg-head" role="columnheader" style={{ gridColumn: ci + 2 }} title={`Tô cả ngày ${c.head}`} onClick={() => fillLine(ci, null)}>
            <b>{c.head}</b>
            {c.sub && <small>{c.sub}</small>}
          </button>
        ) : (
          <div key={c.key} className="tg-head" role="columnheader" style={{ gridColumn: ci + 2 }}>
            <b>{p.dense && c.sub?.includes('/') ? c.sub.slice(0, 5) : c.head}</b>
            {c.sub && <small>{c.sub}</small>}
          </div>
        ),
      )}
      {p.rows.map((m, r) => (
        <Row key={m} m={m} r={r} p={p} total={total} inDrag={inDrag} drag={drag} inWindow={inWindow} focus={focus} onRow={() => fillLine(null, r)} />
      ))}
      {(p.overlays ?? []).map((o, i) => {
        const c = colOf.get(o.day);
        const r0 = rowOf.get(o.start);
        const r1 = rowOf.get(o.end - p.slotMin);
        if (c == null || r0 == null || r1 == null) return null;
        return (
          <div key={`${o.kind}${i}`} className={cn('tg-ov', `is-${o.kind}`)} style={{ gridColumn: c + 2, gridRow: `${r0 + 2} / ${r1 + 3}` }} aria-hidden>
            {o.label && <span>{o.label}</span>}
          </div>
        );
      })}
    </div>
  );
});

function Row({ m, r, p, total, inDrag, drag, inWindow, focus, onRow }: { m: number; r: number; p: Props; total: number; inDrag: (c: number, r: number) => boolean | null; drag: { to: CellState } | null; inWindow: (c: number, r: number) => boolean; focus: { c: number; r: number }; onRow: () => void }) {
  const hour = m % 60 === 0;
  const last = r === p.rows.length - 1;
  return (
    <>
      {p.variant === 'paint' ? (
        <button type="button" tabIndex={-1} className={cn('tg-time', hour && 'is-hour')} style={{ gridRow: r + 2 }} title={`Tô ${fmtMin(m)} mọi ngày`} onClick={onRow}>{hour || p.slotMin >= 60 ? fmtMin(m) : ''}</button>
      ) : (
        <div className={cn('tg-time', hour && 'is-hour')} style={{ gridRow: r + 2 }} aria-hidden>{hour || p.slotMin >= 60 ? fmtMin(m) : ''}</div>
      )}
      {p.cols.map((col, c) => {
        const ok = inWindow(c, r);
        const k = key(col.key, m);
        const at = { gridColumn: c + 2, gridRow: r + 2 };
        const locked = ok && p.lockedOf?.(col.key, m);
        const tabbable = focus.c === c && focus.r === r;
        if (!ok) return <div key={k} className={cn('tg-cell is-off', hour && 'is-hour', last && 'is-last')} style={at} data-c={c} data-r={r} aria-disabled tabIndex={tabbable ? 0 : -1} />;
        let cls = '';
        let bg: string | undefined;
        let title = `${col.head}${col.sub ? ` ${col.sub}` : ''} · ${fmtMin(m)}–${fmtMin(m + p.slotMin)}`;
        if (p.variant === 'paint') {
          const st = locked ? 'blocked' : p.stateOf?.(col.key, m) ?? null;
          cls = st ? `is-${st}` : '';
          if (!locked && inDrag(c, r)) cls += drag?.to ? ` is-pv is-pv-${drag.to}` : ' is-pv is-pv-erase';
          if (locked) title += ' · không thể họp';
        } else {
          const h = p.heat?.get(k);
          const f = h?.free ?? 0;
          if (locked) cls = 'is-blocked';
          else {
            bg = heatColor(total ? f / total : 0);
            if (total && f === total) cls += ' is-all';
            if (h?.busy) cls += ' has-busy';
            if (p.focus) cls += p.focus.free.has(k) ? ' is-mine' : p.focus.busy.has(k) ? ' is-mine-busy' : ' is-dim';
          }
          if (p.pulse?.has(k)) cls += ' is-pulse';
          if (p.selected && p.selected.day === col.key && p.selected.m === m) cls += ' is-sel';
          title += locked ? ' · không thể họp' : ` · ${f}/${total} rảnh${h?.busy ? `, ${h.busy} bận` : ''}`;
        }
        return (
          <div
            key={k}
            className={cn('tg-cell', hour && 'is-hour', last && 'is-last', cls)}
            style={bg ? { ...at, background: bg } : at}
            data-c={c}
            data-r={r}
            role="gridcell"
            aria-label={title}
            title={p.variant === 'paint' ? undefined : title}
            tabIndex={tabbable ? 0 : -1}
            onPointerEnter={p.variant === 'heat' ? () => p.onHover?.({ day: col.key, m }) : undefined}
            onClick={p.variant === 'heat' ? () => p.onPick?.({ day: col.key, m }) : undefined}
          />
        );
      })}
    </>
  );
}
