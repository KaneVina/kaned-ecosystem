import { useCallback, useRef } from 'react';
import { newIdempotencyKey } from './api';

/**
 * One Idempotency-Key per user intent. keyFor(payload) returns the same key
 * for as long as the payload stays the same, so pressing "Save" again after a
 * timeout repeats the very same request and the server answers with the first
 * result instead of creating a second copy. Edit the form and the next try
 * gets a fresh key, because it is a different request. Call done() after
 * success.
 */
export function useIdempotencyKey() {
  const state = useRef<{ key: string; fingerprint: string } | null>(null);

  const keyFor = useCallback((payload: unknown) => {
    const fingerprint = JSON.stringify(payload ?? null);
    if (!state.current || state.current.fingerprint !== fingerprint) {
      state.current = { key: newIdempotencyKey(), fingerprint };
    }
    return state.current.key;
  }, []);

  const done = useCallback(() => {
    state.current = null;
  }, []);

  return { keyFor, done };
}
