import { useSyncExternalStore } from 'react';

const KEY = 'kaned.pointerFx';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setPointerFxEnabled(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
  listeners.forEach((l) => l());
}

/** Whether the pointer ring and tap ripple are shown. On by default; saved on this device. */
export function usePointerFxEnabled() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener('storage', cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', cb);
      };
    },
    read,
    () => true,
  );
}
