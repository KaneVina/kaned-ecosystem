import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { IDLE_AFTER_SECONDS, PING_EVERY_SECONDS, type StartViewDto, type TrackedKind } from '@kaned/shared';
import { BASE_URL, http } from '@/lib/api';

/*
 * Counts how long each page of the app is actually looked at: only while the
 * tab is visible and the person has done something in the last few minutes
 * (or is inside an embedded viewer, which swallows mouse events). An open tab
 * checks in every 30 seconds; that is also what makes someone "online".
 */

const PING_URL = `${BASE_URL}/api/activity/ping`;
const DOCUMENT_IDLE_MS = 15 * 60 * 1000;

let token: string | null = null;
let pendingMs = 0;
let lastTick = 0;
let lastInput = Date.now();
let lastPing = Date.now();
let idleMs = IDLE_AFTER_SECONDS * 1000;
let openSeq = 0;
/** The page being counted, so a second open() for it (React StrictMode, a re-mount) is a no-op. */
let openPath: string | null = null;

function tabId() {
  try {
    let id = sessionStorage.getItem('kaned.tab');
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
      sessionStorage.setItem('kaned.tab', id);
    }
    return id;
  } catch {
    return 'nostorage-tab';
  }
}

function classify(pathname: string): { kind: TrackedKind; entityId: string | null } {
  const doc = pathname.match(/^\/app\/library\/([^/]+)\/?$/);
  if (doc) return { kind: 'document', entityId: decodeURIComponent(doc[1]) };
  const subject = pathname.match(/^\/app\/subjects\/([^/]+)\/?$/);
  if (subject) return { kind: 'subject', entityId: decodeURIComponent(subject[1]) };
  return { kind: 'page', entityId: null };
}

function isActive() {
  if (document.visibilityState !== 'visible') return false;
  if (document.activeElement?.tagName === 'IFRAME') return true;
  return Date.now() - lastInput < idleMs;
}

function tick() {
  const now = performance.now();
  if (lastTick && isActive()) pendingMs += Math.min(now - lastTick, 5_000);
  lastTick = now;
}

function send(final: boolean) {
  tick();
  if (!token) return;
  const seconds = Math.floor(pendingMs / 1000);
  pendingMs -= seconds * 1000;
  const body = JSON.stringify({ token, seconds, final });
  lastPing = Date.now();
  try {
    if (navigator.sendBeacon?.(PING_URL, new Blob([body], { type: 'text/plain' }))) return;
  } catch {
    /* fall through */
  }
  void fetch(PING_URL, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => undefined);
}

async function open(path: string) {
  const pathname = path.split('?')[0];
  if (openPath === pathname) return;
  send(true);
  openPath = pathname;
  token = null;
  pendingMs = 0;
  const seq = ++openSeq;
  const { kind, entityId } = classify(pathname);
  idleMs = kind === 'document' ? DOCUMENT_IDLE_MS : IDLE_AFTER_SECONDS * 1000;
  try {
    const { data } = await http.post<StartViewDto>('/activity/views', { clientId: tabId(), path: path.slice(0, 300), kind, entityId });
    if (seq === openSeq) token = data.token;
  } catch {
    /* tracking never gets in the way */
  }
}

let mounted = false;

const onInput = () => {
  lastInput = Date.now();
};

/** Mount once in the signed-in app shell. */
export function useActivityTracker() {
  const location = useLocation();

  useEffect(() => {
    mounted = true;
    lastTick = performance.now();
    lastInput = Date.now();
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    for (const e of events) window.addEventListener(e, onInput, { passive: true, capture: true });

    const timer = window.setInterval(() => {
      tick();
      const due = Date.now() - lastPing >= PING_EVERY_SECONDS * 1000;
      if (due && (isActive() || pendingMs >= 1000)) send(false);
    }, 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send(false);
      else {
        lastTick = performance.now();
        lastInput = Date.now();
        send(false);
      }
    };
    const onHide = () => send(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);

    return () => {
      window.clearInterval(timer);
      for (const e of events) window.removeEventListener(e, onInput, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      // Leaving the app (signing out): close the view, unless the shell is
      // only re-mounting, in which case the same page opens again at once.
      queueMicrotask(() => {
        if (!mounted) {
          send(true);
          token = null;
          openPath = null;
        }
      });
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void open(location.pathname + location.search);
    // A new page per path; filters and searches on the same page are not new views.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}
