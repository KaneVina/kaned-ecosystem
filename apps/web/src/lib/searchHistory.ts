import { useCallback, useState } from 'react';

const KEY = 'kaned.search.history';
const MAX = 8;
// Per-session on purpose: history is cleared when the tab is closed.
const store = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

function read(): string[] {
  try {
    const v = JSON.parse(store()?.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    store()?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: history just won't persist */
  }
}

export function useSearchHistory() {
  const [items, setItems] = useState<string[]>(read);

  const add = useCallback((raw: string) => {
    const q = raw.trim().replace(/\s+/g, ' ');
    if (q.length < 2) return;
    const lower = q.toLowerCase();
    // Drop duplicates and earlier, shorter prefixes of what was just typed ("pr" → "prm393").
    const next = [q, ...read().filter((x) => x.toLowerCase() !== lower && !lower.startsWith(x.toLowerCase()))].slice(0, MAX);
    write(next);
    setItems(next);
  }, []);

  const remove = useCallback((q: string) => {
    const next = read().filter((x) => x !== q);
    write(next);
    setItems(next);
  }, []);

  const clear = useCallback(() => {
    write([]);
    setItems([]);
  }, []);

  return { items, add, remove, clear };
}
