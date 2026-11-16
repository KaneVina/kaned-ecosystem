import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SearchOption {
  value: string;
  label: string;
  /** Shown bold before the label, and searched too (e.g. a subject code). */
  code?: string;
  /** Extra words that should match but are not shown. */
  keywords?: string;
  depth?: number;
}

/** Lower-case and strip Vietnamese accents, so "cau truc" finds "Cấu trúc". */
export function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * A select you can type into: the list filters as you type (code or name,
 * with or without accents), arrows move, Enter picks. For long lists such
 * as subjects; short fixed lists stay as plain selects or pills.
 */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Chọn…',
  searchPlaceholder = 'Gõ để tìm…',
  disabled,
  invalid,
  clearable,
  emptyText = 'Không có kết quả',
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  emptyText?: string;
}) {
  const auto = useId();
  const listId = `${id ?? auto}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return options;
    const words = q.split(/\s+/);
    const scored = options
      .map((o) => {
        const hay = fold(`${o.code ?? ''} ${o.label} ${o.keywords ?? ''}`);
        if (!words.every((w) => hay.includes(w))) return null;
        const code = fold(o.code ?? '');
        const score = code === q ? 0 : code.startsWith(q) ? 1 : fold(o.label).startsWith(q) ? 2 : 3;
        return { o, score };
      })
      .filter((x): x is { o: SearchOption; score: number } => x !== null);
    return scored.sort((a, b) => a.score - b.score).map((x) => x.o);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
    const i = options.findIndex((o) => o.value === value);
    setActive(i < 0 ? 0 : i);
    requestAnimationFrame(() => input.current?.focus());
  };
  const pick = (o: SearchOption) => {
    onChange(o.value);
    setOpen(false);
  };

  return (
    <div ref={root} className={cn('ss', open && 'is-open', invalid && 'is-invalid', disabled && 'is-disabled')}>
      <button
        type="button"
        id={id}
        className="ss-trigger select"
        onClick={() => (open ? setOpen(false) : openList())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
      >
        <span className={cn('ss-value', !selected && 'is-placeholder')}>
          {selected ? (
            <>
              {selected.code && <b>{selected.code}</b>}
              {selected.label}
            </>
          ) : (
            placeholder
          )}
        </span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            className="ss-clear"
            aria-label="Bỏ chọn"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
          >
            <X className="ic ic-xs" />
          </span>
        )}
        <ChevronDown className="ic ic-sm ss-chev" />
      </button>
      {open && (
        <div className="ss-pop">
          <div className="ss-search">
            <Search className="ic ic-sm" />
            <input
              ref={input}
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered[active]) pick(filtered[active]);
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              enterKeyHint="done"
            />
            <span className="ss-count">{filtered.length}</span>
          </div>
          <ul ref={list} id={listId} role="listbox" className="ss-list">
            {filtered.length === 0 && <li className="ss-empty">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                className={cn('ss-opt', i === active && 'is-active')}
                style={o.depth ? { paddingLeft: 12 + o.depth * 16 } : undefined}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(o)}
              >
                {o.code && <b>{o.code}</b>}
                <span>{o.label}</span>
                {o.value === value && <Check className="ic ic-sm" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
