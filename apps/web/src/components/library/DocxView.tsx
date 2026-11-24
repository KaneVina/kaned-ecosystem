import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

/**
 * Draws a Word file in its own layout — page size and margins, fonts, sizes,
 * colours, tables, headers and footers — using docx-preview (loaded only when
 * needed). Pages shrink to fit narrow screens. Copying, dragging and the
 * right-click menu are turned off: this is for reading inside Kaned.
 */
export function DocxView({ src, onReady, onFail }: { src: string; onReady: () => void; onFail: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  /** The zoom that fits the page to the frame, and the reader's own zoom on top of it. */
  const fitRef = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const apply = () => {
    if (host.current) host.current.style.zoom = String(fitRef.current * zoomRef.current);
  };

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      try {
        const [{ renderAsync }, res] = await Promise.all([import('docx-preview'), fetch(src, { credentials: 'same-origin' })]);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (dead || !host.current) return;
        await renderAsync(blob, host.current, undefined, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          experimental: true,
          useBase64URL: true,
        });
        if (dead) return;
        // Shrink the pages to the frame's width when they do not fit (phones).
        const fit = () => {
          const box = scroller.current;
          const h = host.current;
          if (!box || !h) return;
          const pages = [...h.querySelectorAll<HTMLElement>('section.docx')];
          const w = Math.max(0, ...pages.map((p) => p.offsetWidth));
          if (!w) return;
          const room = box.clientWidth - 24;
          fitRef.current = Math.min(1, room / w);
          apply();
        };
        fit();
        ro = new ResizeObserver(fit);
        if (scroller.current) ro.observe(scroller.current);
        setReady(true);
        onReady();
      } catch {
        if (!dead) onFail();
      }
    })();
    return () => {
      dead = true;
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(apply, [zoom]);

  const stop = (e: { preventDefault: () => void }) => e.preventDefault();
  const step = (d: number) => setZoom((z) => Math.min(3, Math.max(0.5, Math.round((z + d) * 100) / 100)));
  return (
    <>
      <div ref={scroller} className="lv-docx" onContextMenu={stop} onCopy={stop} onCut={stop} onDragStart={stop}>
        <div ref={host} className="lv-docx-host" />
      </div>
      {ready && (
        <div className="lv-zoom" role="group" aria-label="Thu phóng">
          <button type="button" onClick={() => step(-0.25)} disabled={zoom <= 0.5} aria-label="Thu nhỏ">
            <Minus className="ic ic-sm" />
          </button>
          <button type="button" className="lv-zoom-n" onClick={() => setZoom(1)} title="Vừa khung">
            {Math.round(fitRef.current * zoom * 100)}%
          </button>
          <button type="button" onClick={() => step(0.25)} disabled={zoom >= 3} aria-label="Phóng to">
            <Plus className="ic ic-sm" />
          </button>
        </div>
      )}
    </>
  );
}
