import { useEffect } from 'react';

/**
 * Makes the "selected" mark of segmented controls, tabs and the top nav glide
 * from the old choice to the new one instead of jumping.
 *
 * It watches the page for these groups, adds one absolutely placed element to
 * each, and keeps it over the selected child. The group's own static highlight
 * is hidden only once the glider is in place (`.has-sl`), so nothing flashes and
 * a group the script never reaches still looks right. Positions come from
 * offsetLeft/Top, so a scrolling tab strip carries the glider with it.
 */

type Kind = 'pill' | 'line' | 'nav';
const GROUPS: Array<{ sel: string; kind: Kind; active: string }> = [
  { sel: '.seg, .vec-seg', kind: 'pill', active: '[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .is-on' },
  { sel: '.tabs, .adm-tabs', kind: 'line', active: '[aria-selected="true"], [aria-current="page"], .active' },
  { sel: '.nav-links', kind: 'nav', active: '.active, [aria-current="page"]' },
];
const ALL = GROUPS.map((g) => g.sel).join(', ');
const WATCH = ['aria-pressed', 'aria-checked', 'aria-selected', 'aria-current', 'class'];

interface Entry {
  kind: Kind;
  active: string;
  ind: HTMLSpanElement;
  mo: MutationObserver;
  ro: ResizeObserver;
  watched: Element | null;
  placed: boolean;
  raf: number;
}

export function SlideIndicators() {
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const entries = new Map<HTMLElement, Entry>();

    const update = (box: HTMLElement, e: Entry) => {
      e.raf = 0;
      if (!e.ind.isConnected || e.ind.parentElement !== box) box.appendChild(e.ind);
      const el = [...box.children].find((c) => c !== e.ind && c.matches(e.active)) as HTMLElement | undefined;
      if (e.watched !== (el ?? null)) {
        if (e.watched) e.ro.unobserve(e.watched);
        if (el) e.ro.observe(el);
        e.watched = el ?? null;
      }
      if (!el || !el.offsetWidth) {
        e.ind.style.opacity = '0';
        return;
      }
      let x = el.offsetLeft;
      let y = el.offsetTop;
      let w = el.offsetWidth;
      let h = el.offsetHeight;
      if (e.kind === 'line') {
        const inset = box.classList.contains('adm-tabs') ? 8 : 10;
        x += inset;
        w -= inset * 2;
        y += h - 2;
        h = 2;
      }
      const s = e.ind.style;
      s.width = `${w}px`;
      s.height = `${h}px`;
      s.transform = `translate3d(${x}px, ${y}px, 0)`;
      s.opacity = '1';
      if (!e.placed) {
        // First placement lands without gliding in from the corner.
        e.placed = true;
        box.classList.add('has-sl');
        requestAnimationFrame(() => e.ind.classList.add('is-ready'));
      }
    };
    const schedule = (box: HTMLElement, e: Entry) => {
      if (!e.raf) e.raf = requestAnimationFrame(() => update(box, e));
    };

    const attach = (box: HTMLElement) => {
      if (entries.has(box) || box.dataset.sl === 'off') return;
      const g = GROUPS.find((x) => box.matches(x.sel));
      if (!g) return;
      const ind = document.createElement('span');
      ind.className = `sl-ind sl-${g.kind}`;
      ind.setAttribute('aria-hidden', 'true');
      box.appendChild(ind);
      const e: Entry = { kind: g.kind, active: g.active, ind, mo: null!, ro: null!, watched: null, placed: false, raf: 0 };
      e.mo = new MutationObserver((list) => {
        // Ignore the glider's own changes.
        if (list.every((m) => m.target === ind)) return;
        schedule(box, e);
      });
      e.mo.observe(box, { attributes: true, attributeFilter: WATCH, subtree: true, childList: true });
      e.ro = new ResizeObserver(() => schedule(box, e));
      e.ro.observe(box);
      entries.set(box, e);
      schedule(box, e);
    };
    const detach = (box: HTMLElement, e: Entry) => {
      cancelAnimationFrame(e.raf);
      e.mo.disconnect();
      e.ro.disconnect();
      e.ind.remove();
      box.classList.remove('has-sl');
      entries.delete(box);
    };

    let scanRaf = 0;
    const scan = () => {
      scanRaf = 0;
      for (const [box, e] of entries) if (!box.isConnected) detach(box, e);
      document.querySelectorAll<HTMLElement>(ALL).forEach(attach);
    };
    const queueScan = () => {
      if (!scanRaf) scanRaf = requestAnimationFrame(scan);
    };
    const body = new MutationObserver(queueScan);
    body.observe(document.body, { childList: true, subtree: true });
    const onResize = () => entries.forEach((e, box) => schedule(box, e));
    window.addEventListener('resize', onResize);
    document.fonts?.ready.then(onResize).catch(() => {});
    scan();

    return () => {
      cancelAnimationFrame(scanRaf);
      body.disconnect();
      window.removeEventListener('resize', onResize);
      entries.forEach((e, box) => detach(box, e));
    };
  }, []);
  return null;
}
