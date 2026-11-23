import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerItem, HeartbeatResponse, IntegrityPreset } from '@kaned/shared';
import { HEARTBEAT_MS, RELAXED_GRACE_SEC } from '@kaned/shared';
import { vec } from './api';

/* ───────────────────────── server clock ───────────────────────── */

const samples: number[] = [];
let offset = 0;
/** Takes a few readings and uses the middle one, so one slow reply cannot skew the clock. */
export function syncClock(serverNow: number, sentAt: number, receivedAt: number) {
  samples.push(serverNow - (sentAt + receivedAt) / 2);
  if (samples.length > 5) samples.shift();
  const sorted = samples.slice().sort((a, b) => a - b);
  offset = sorted[Math.floor(sorted.length / 2)]!;
}
/** Server time, whatever the device clock says. */
export const serverNow = () => Date.now() + offset;

/** Re-renders every `ms` with the server's time. */
export function useServerTick(ms = 1000) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* ───────────────────────── autosave ───────────────────────── */

export type SaveState = 'saved' | 'saving' | 'offline';
type Answer = { oids: string[]; flagged: boolean; seq: number };

/**
 * The browser shows a choice at once and saves it in the background. Pending
 * choices wait in a queue that survives a reload (sessionStorage), go out in
 * batches, and are only dropped once the server has accepted them.
 */
export function useAutosave(attemptId: string, initial: Record<string, Answer>, enabled: boolean) {
  const key = `vec:q:${attemptId}`;
  const [answers, setAnswers] = useState<Record<string, Answer>>(initial);
  const [status, setStatus] = useState<SaveState>('saved');
  const seq = useRef(Math.max(0, ...Object.values(initial).map((a) => a.seq)) + 1);
  const queue = useRef<Map<string, AnswerItem>>(new Map());
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);

  // Saved answers arrive with the paper, after the first render.
  useEffect(() => {
    const incoming = Object.entries(initial);
    if (!incoming.length) return;
    seq.current = Math.max(seq.current, ...incoming.map(([, a]) => a.seq + 1));
    setAnswers((prev) => {
      const next = { ...prev };
      for (const [qid, a] of incoming) if (!next[qid] || next[qid]!.seq < a.seq) next[qid] = a;
      return next;
    });
  }, [initial]);

  // Pick up anything a previous page load had not sent yet.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const items = JSON.parse(raw) as AnswerItem[];
        for (const it of items) queue.current.set(it.qid, it);
        setAnswers((a) => {
          const next = { ...a };
          for (const it of items) if (!next[it.qid] || next[it.qid]!.seq < it.seq) next[it.qid] = { oids: it.oids, flagged: it.flagged, seq: it.seq };
          return next;
        });
        seq.current = Math.max(seq.current, ...items.map((i) => i.seq + 1));
        if (items.length) schedule(300);
      }
    } catch {
      /* private mode: the queue just will not survive a reload */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  const persist = useCallback(() => {
    try {
      const items = [...queue.current.values()];
      if (items.length) sessionStorage.setItem(key, JSON.stringify(items));
      else sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (busy.current) return false;
    if (!queue.current.size) {
      setStatus('saved');
      return true;
    }
    busy.current = true;
    setStatus(navigator.onLine ? 'saving' : 'offline');
    const batch = [...queue.current.values()].slice(0, 50);
    try {
      await vec.saveAnswers(attemptId, batch);
      for (const it of batch) if (queue.current.get(it.qid)?.seq === it.seq) queue.current.delete(it.qid);
      failures.current = 0;
      persist();
      busy.current = false;
      if (queue.current.size) return flush();
      setStatus('saved');
      return true;
    } catch (e) {
      busy.current = false;
      const status = (e as { status?: number }).status ?? 0;
      // The server refused for good (locked, submitted, time up): stop retrying.
      if (status === 423 || status === 409) {
        setStatus('offline');
        return false;
      }
      failures.current++;
      setStatus('offline');
      schedule(Math.min(15_000, 1500 * 2 ** failures.current));
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, persist]);

  function schedule(ms: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), ms);
  }

  const set = useCallback(
    (qid: string, oids: string[], flagged?: boolean) => {
      if (!enabled) return;
      setAnswers((prev) => {
        const cur = prev[qid];
        const item: AnswerItem = { qid, oids, flagged: flagged ?? cur?.flagged ?? false, seq: seq.current++ };
        queue.current.set(qid, item);
        persist();
        schedule(700);
        return { ...prev, [qid]: { oids: item.oids, flagged: item.flagged, seq: item.seq } };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, persist],
  );

  useEffect(() => {
    const online = () => void flush();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [flush]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const pendingItems = useCallback(() => [...queue.current.values()], []);
  const clear = useCallback(() => {
    queue.current.clear();
    persist();
  }, [persist]);

  return { answers, set, status, flush, pendingItems, clear };
}

/* ───────────────────────── heartbeat ───────────────────────── */

export function useHeartbeat(opts: {
  attemptId: string;
  active: boolean;
  connectionId: string | null;
  read: () => { fullscreen: boolean; visible: boolean; focused: boolean; current: number; answered: number };
  onResponse: (r: HeartbeatResponse) => void;
}) {
  const { attemptId, active, connectionId, onResponse } = opts;
  const read = useRef(opts.read);
  read.current = opts.read;
  const cb = useRef(onResponse);
  cb.current = onResponse;
  const ack = useRef(0);
  const [online, setOnline] = useState(true);

  const beat = useCallback(async () => {
    const sentAt = Date.now();
    try {
      const r = await vec.heartbeat(attemptId, { ...read.current(), connectionId: connectionId ?? undefined, ackMessage: ack.current });
      syncClock(r.serverNow, sentAt, Date.now());
      for (const c of r.commands) if (c.type === 'MESSAGE') ack.current = Math.max(ack.current, c.id);
      setOnline(true);
      cb.current(r);
    } catch (e) {
      const st = (e as { status?: number }).status ?? 0;
      if (st === 0) setOnline(false);
      else if (st === 404) cb.current({ serverNow: Date.now(), attemptState: 'VOIDED', sessionStatus: 'ENDED', deadlineAt: null, lockReason: null, commands: [{ type: 'REMOVE', reason: '' }] });
    }
  }, [attemptId, connectionId]);

  useEffect(() => {
    if (!active) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      void beat();
      t = setTimeout(loop, HEARTBEAT_MS + Math.random() * 1500 - 750);
    };
    loop();
    return () => clearTimeout(t);
  }, [active, beat]);

  return { online, beat };
}

/* ───────────────────────── exam guard ───────────────────────── */

export interface GuardOptions {
  attemptId: string;
  active: boolean;
  preset: IntegrityPreset;
  blockCopy: boolean;
  onWarn: (message: string) => void;
  onLocked: (reason: string) => void;
}

export const canFullscreen = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
export const isFullscreen = () => !!document.fullscreenElement || (window.innerHeight >= screen.height - 4 && window.innerWidth >= screen.width - 4 && window.matchMedia('(display-mode: fullscreen)').matches);
export const enterFullscreen = () => document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions).catch(() => undefined);

/**
 * Watches for the behaviours a lecturer cares about and reports each one to the
 * server, which decides what it means. The browser never decides to lock.
 */
export function useExamGuard({ attemptId, active, preset, blockCopy, onWarn, onLocked }: GuardOptions) {
  const warn = useRef(onWarn);
  warn.current = onWarn;
  const locked = useRef(onLocked);
  locked.current = onLocked;
  const lastSent = useRef<Record<string, number>>({});

  const report = useCallback(
    async (type: string, data?: Record<string, unknown>) => {
      const now = Date.now();
      // The same behaviour twice in 400 ms is one behaviour.
      if (now - (lastSent.current[type] ?? 0) < 400) return;
      lastSent.current[type] = now;
      try {
        const r = await vec.violation(attemptId, type, data);
        if (r.state === 'SUSPENDED') locked.current(r.lockReason ?? 'Bài thi bị khóa');
        else if (r.severity === 'WARN') warn.current(WARN_TEXT[type] ?? 'Hành vi này đã được ghi nhận.');
      } catch {
        /* the next heartbeat will show the state */
      }
    },
    [attemptId],
  );

  useEffect(() => {
    if (!active) return;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const onFs = () => {
      if (document.fullscreenElement) {
        if (grace) clearTimeout(grace);
        grace = null;
        return;
      }
      void report('FULLSCREEN_EXIT');
      if (preset === 'RELAXED') {
        grace = setTimeout(() => {
          if (!document.fullscreenElement) void report('FULLSCREEN_EXIT', { graceExpired: true });
        }, RELAXED_GRACE_SEC * 1000);
      }
    };
    const onVis = () => document.hidden && void report('TAB_HIDDEN');
    const onBlur = () => !document.hidden && void report('WINDOW_BLUR');
    const onCopy = (e: ClipboardEvent) => {
      if (!blockCopy) return;
      e.preventDefault();
      void report('COPY_ATTEMPT');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') void report('PRINT_SCREEN');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && ['KeyP', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        void report('SHORTCUT_BLOCKED', { key: e.code });
      }
      if (blockCopy && mod && ['KeyC', 'KeyX'].includes(e.code) && !(e.target as HTMLElement)?.closest?.('input,textarea')) {
        e.preventDefault();
        void report('COPY_ATTEMPT');
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      window.removeEventListener('keydown', onKey, true);
      if (grace) clearTimeout(grace);
    };
  }, [active, preset, blockCopy, report]);

  return { report };
}

const WARN_TEXT: Record<string, string> = {
  COPY_ATTEMPT: 'Không được sao chép nội dung đề thi.',
  TAB_HIDDEN: 'Bạn vừa chuyển sang tab khác. Lần sau bài thi có thể bị khóa.',
  WINDOW_BLUR: 'Bạn vừa rời cửa sổ thi. Lần sau bài thi có thể bị khóa.',
  FULLSCREEN_EXIT: 'Hãy quay lại chế độ toàn màn hình.',
  SHORTCUT_BLOCKED: 'Phím tắt này bị chặn trong phòng thi.',
  PRINT_SCREEN: 'Chụp màn hình bị ghi nhận.',
  IP_CHANGE: 'Địa chỉ mạng của bạn vừa thay đổi.',
};

export function useStable<T>(v: T) {
  return useMemo(() => v, [JSON.stringify(v)]); // eslint-disable-line react-hooks/exhaustive-deps
}
