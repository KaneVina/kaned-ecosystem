import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, BookOpenText, Copy, Cpu, FileSearch, GraduationCap, Layers, Maximize2, Mic, Minimize2, MonitorCheck, SquarePen, Sparkles, Square, ThumbsDown, ThumbsUp, Upload, Volume2, X,
} from 'lucide-react';
import type { AssistantSearchQuery, AssistantSearchResult } from '@kaned/shared';
import { http } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuth } from '@/providers/AuthProvider';
import { respond, type Block, type Ctx, type Mood, type Reply } from './brain';
import { Blocks } from './Blocks';
import { KB } from './kb';
import { KaiBot, type BotMood } from './KaiBot';
import { forks, jag, reducedMotion, rnd, strike } from './bolt';
import { MODELS, forget, generate, interrupt, isCached, llmStore, loadModel, turnOff, webgpuSupport, type ModelChoice } from './llm';
import './assistant.css';

/* ───────────────────────────── types & storage ───────────────────────────── */

interface Msg {
  id: string;
  role: 'user' | 'kai';
  text?: string;
  reply?: Reply;
  at: number;
  fresh?: boolean;
  fb?: 1 | -1;
}
interface Prefs {
  deep: boolean;
  model: ModelChoice['key'];
  launcher: { side: 'left' | 'right'; bottom: number };
  box: { x: number; y: number; w: number; h: number } | null;
  xl: boolean;
}
const PREFS_KEY = 'kai:prefs';
const defaultPrefs = (): Prefs => ({ deep: false, model: 'balanced', launcher: { side: 'right', bottom: 20 }, box: null, xl: false });
const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: Kai still works, it just forgets */
  }
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const plainOf = (r?: Reply) =>
  (r?.blocks ?? [])
    .map((b) => (b.k === 'text' || b.k === 'note' ? b.md : b.k === 'llm' ? b.text : b.k === 'steps' ? b.items.map((s, i) => `${i + 1}. ${s}`).join('\n') : b.k === 'docs' ? b.items.map((d) => `- ${d.title}`).join('\n') : ''))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\*\*/g, '')
    .replace(/`/g, '');

/* ───────────────────────────── suggestions by page ───────────────────────────── */

function suggestionsFor(path: string): Array<{ icon: typeof FileSearch; text: string }> {
  if (path.startsWith('/app/library/')) return [{ icon: BookOpenText, text: 'Tải tài liệu về máy' }, { icon: FileSearch, text: 'Lưu tài liệu để xem sau' }, { icon: Sparkles, text: 'Tài liệu nội bộ là gì?' }, { icon: Upload, text: 'Cách đăng tài liệu' }];
  if (path.startsWith('/app/library')) return [{ icon: FileSearch, text: 'Đề thi PRM393' }, { icon: BookOpenText, text: 'Slide môn SWT301' }, { icon: Sparkles, text: 'Cách lọc tài liệu theo môn' }, { icon: Upload, text: 'Cách đăng tài liệu' }];
  if (path.startsWith('/app/flashcards')) return [{ icon: Layers, text: 'Thẻ đến hạn là gì?' }, { icon: Sparkles, text: 'Các chế độ học của bộ thẻ' }, { icon: Layers, text: 'Flashcard PRM393' }, { icon: FileSearch, text: 'Đề cương ôn tập SWT301' }];
  if (path.startsWith('/app/vec')) return [{ icon: MonitorCheck, text: 'Vào phòng thi thế nào?' }, { icon: Upload, text: 'Nộp bài PE thế nào?' }, { icon: Sparkles, text: 'Chuyển tab có bị khoá bài không?' }, { icon: MonitorCheck, text: 'Tạo phiên thi trắc nghiệm' }];
  if (path.startsWith('/app/subjects') || path.startsWith('/app/tools/gpa')) return [{ icon: GraduationCap, text: '8.5 là điểm gì?' }, { icon: Sparkles, text: 'Kỳ tới học môn gì?' }, { icon: GraduationCap, text: 'Thang điểm chữ và hệ 4' }, { icon: FileSearch, text: 'Đề thi PRO192' }];
  return [
    { icon: FileSearch, text: 'Tìm đề thi PRM393' },
    { icon: BookOpenText, text: 'Bài tập SQL có lời giải' },
    { icon: Upload, text: 'Cách đăng tài liệu' },
    { icon: MonitorCheck, text: 'Vào phòng thi thế nào?' },
    { icon: GraduationCap, text: '8.5 là điểm gì?' },
    { icon: Layers, text: 'Học flashcard hiệu quả' },
  ];
}

const COMMANDS = [
  { cmd: '/tim', hint: 'Tìm tài liệu, ví dụ /tim đề thi PRM393' },
  { cmd: '/gpa', hint: 'Quy đổi một điểm hệ 10, ví dụ /gpa 7.8' },
  { cmd: '/huongdan', hint: 'Xem mọi chủ đề Kai hướng dẫn' },
  { cmd: '/ai', hint: 'Bật hoặc chỉnh AI sâu' },
  { cmd: '/moi', hint: 'Bắt đầu cuộc trò chuyện mới' },
];

const PLACEHOLDERS = ['Hỏi Kai: đề thi PRM393…', 'Hỏi Kai: cách đăng tài liệu…', 'Hỏi Kai: 7.8 là điểm gì?', 'Hỏi Kai: slide môn SWT301…', 'Hỏi Kai: vào phòng thi thế nào?'];

type SR = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const speechCtor = (): (new () => SR) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/* ───────────────────────────── the assistant ───────────────────────────── */

export default function Assistant() {
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const storeKey = `kai:chat:${user?.id ?? 'guest'}`;
  const [prefs, setPrefs] = useState<Prefs>(() => read(PREFS_KEY, defaultPrefs()));
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => read<{ msgs: Msg[] }>(storeKey, { msgs: [] }).msgs.map((m) => ({ ...m, fresh: false })));
  const ctxRef = useRef<Ctx>(read<{ ctx: Ctx }>(storeKey, { ctx: { path: '/app' } }).ctx);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [mood, setMood] = useState<BotMood>('idle');
  const [deepOpen, setDeepOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [greet, setGreet] = useState(false);
  const [listening, setListening] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [ph, setPh] = useState(0);
  const [toast, setToast] = useState('');
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 640px)').matches);
  const llm = useSyncExternalStore(llmStore.subscribe, llmStore.get);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const recog = useRef<SR | null>(null);
  const lastSent = useRef('');
  const moodTimer = useRef<ReturnType<typeof setTimeout>>();
  const firstName = user?.name?.trim().split(/\s+/).slice(-1)[0] ?? '';

  useEffect(() => write(PREFS_KEY, prefs), [prefs]);
  useEffect(() => {
    const t = setTimeout(() => write(storeKey, { msgs: msgs.slice(-60).map(({ fresh: _f, ...m }) => m), ctx: ctxRef.current }), 300);
    return () => clearTimeout(t);
  }, [msgs, storeKey]);
  useEffect(() => {
    const mq = matchMedia('(max-width: 640px)');
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Mount, then animate: the panel stays in the DOM for its closing animation.
  useEffect(() => {
    if (open) {
      setShown(true);
      setGreet(false);
      const t = setTimeout(() => field.current?.focus({ preventScroll: true }), 220);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown(false), 260);
    return () => clearTimeout(t);
  }, [open]);

  // Alt+K anywhere; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyK') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open && panel.current?.contains(document.activeElement)) {
        if (deepOpen) setDeepOpen(false);
        else setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, deepOpen]);

  // Out of the way in full-screen views (flashcard exams).
  useEffect(() => {
    const on = () => setHidden(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // Say hello once per device.
  useEffect(() => {
    if (localStorage.getItem('kai:greeted')) return;
    const t1 = setTimeout(() => {
      localStorage.setItem('kai:greeted', '1');
      setGreet(true);
      flash('wave', 3200);
    }, 2600);
    const t2 = setTimeout(() => setGreet(false), 14000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dozes off when nobody is around, wakes up on any movement.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setMood((m) => (m === 'sleep' ? 'idle' : m));
      clearTimeout(t);
      t = setTimeout(() => setMood((m) => (m === 'idle' && !open ? 'sleep' : m)), 45_000);
    };
    wake();
    const evs = ['pointermove', 'keydown', 'scroll', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [open]);

  useEffect(() => {
    if (open || input) return;
    const t = setInterval(() => setPh((n) => (n + 1) % PLACEHOLDERS.length), 3800);
    return () => clearInterval(t);
  }, [open, input]);

  // AI sâu: reopen the cached model quietly when the panel opens.
  useEffect(() => {
    if (!open || !prefs.deep || llm.s !== 'off') return;
    const m = MODELS.find((x) => x.key === prefs.model) ?? MODELS[1]!;
    void isCached(m).then((c) => c && loadModel(m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefs.deep]);

  /* ── electricity: Kai's bolt jumps across the header, then a current runs round the frame ── */
  const headRef = useRef<HTMLElement>(null);
  const arcG = useRef<SVGGElement>(null);
  const arcSvg = useRef<SVGSVGElement>(null);
  const frameSvg = useRef<SVGSVGElement>(null);
  const [zapKey, setZapKey] = useState(0);
  const [launcherZap, setLauncherZap] = useState(false);
  const zapCount = useRef(0);
  const runFrame = useCallback(() => {
    const svg = frameSvg.current;
    const el = panel.current;
    if (!svg || !el || reducedMotion()) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const rx = el.classList.contains('is-sheet') ? 22 : 21;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.querySelectorAll('rect').forEach((r, i) => {
      r.setAttribute('x', '1');
      r.setAttribute('y', '1');
      r.setAttribute('width', String(W - 2));
      r.setAttribute('height', String(H - 2));
      r.setAttribute('rx', String(rx));
      r.animate(
        [
          { strokeDashoffset: 0, opacity: 0 },
          { opacity: 1, offset: 0.08 },
          { opacity: 1, offset: 0.82 },
          { strokeDashoffset: -1000, opacity: 0 },
        ],
        { duration: 1500, delay: i * 40, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' },
      );
    });
  }, []);
  const runArc = useCallback(() => {
    const h = headRef.current;
    const g = arcG.current;
    const svg = arcSvg.current;
    if (!h || !g || !svg || reducedMotion()) return;
    const r = h.getBoundingClientRect();
    const bot = h.querySelector('.kai-head-bot')?.getBoundingClientRect();
    if (!bot || r.width < 50) return;
    svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    const sx = bot.right - r.left - 6;
    const sy = bot.top - r.top + bot.height * 0.5;
    const main = jag(
      [
        [sx, sy],
        [sx + rnd(28, 46), r.height * rnd(0.18, 0.36)],
        [r.width * rnd(0.34, 0.44), r.height * rnd(0.6, 0.82)],
        [r.width * rnd(0.52, 0.62), r.height * rnd(0.2, 0.4)],
        [r.width * rnd(0.7, 0.8), r.height * rnd(0.55, 0.8)],
        [r.width + 10, r.height * rnd(0.3, 0.6)],
      ],
      0.16,
      3,
    );
    void strike(g, main, { run: 720, branches: forks(main, 2, 20), widths: { glow: 5, core: 1.6, hot: 0.7 }, filter: 'url(#kai-arc-blur)' });
    // The name lights up as the bolt passes it, like the letters of the logo.
    h.querySelector('.kai-name')?.animate(
      [{ color: 'inherit', textShadow: 'none' }, { color: '#E9FBFF', textShadow: '0 0 10px rgba(127,227,255,.95), 0 0 22px rgba(127,227,255,.55)', offset: 0.25 }, { color: 'inherit', textShadow: 'none' }],
      { duration: 900, delay: 160, easing: 'ease-out' },
    );
    h.animate([{ boxShadow: 'inset 0 0 0 0 rgba(127,227,255,0)' }, { boxShadow: 'inset 0 -1px 0 0 rgba(127,227,255,.9), inset 0 0 40px 0 rgba(127,227,255,.18)', offset: 0.3 }, { boxShadow: 'inset 0 0 0 0 rgba(127,227,255,0)' }], { duration: 900 });
  }, []);
  const onHeadZap = useCallback(() => {
    zapCount.current++;
    setTimeout(runArc, 300);
    if (zapCount.current % 2 === 1) setTimeout(runFrame, 620);
  }, [runArc, runFrame]);
  const onLauncherZap = useCallback(() => {
    setLauncherZap(true);
    setTimeout(() => setLauncherZap(false), 900);
  }, []);

  const flash = (m: Mood | BotMood, ms = 2600) => {
    clearTimeout(moodTimer.current);
    setMood(m);
    moodTimer.current = setTimeout(() => setMood('idle'), ms);
  };

  const scrollDown = useCallback((smooth = true) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  // Stay pinned to the newest line while an answer types itself out or streams in.
  const pinned = useRef(true);
  pinned.current = atBottom;
  useEffect(() => {
    if (atBottom) scrollDown();
  }, [msgs.length, waiting, atBottom, scrollDown]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !shown) return;
    let raf = 0;
    const mo = new MutationObserver(() => {
      if (!pinned.current || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.scrollTop = el.scrollHeight;
      });
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [shown]);
  useEffect(() => {
    if (open) requestAnimationFrame(() => scrollDown(false));
  }, [open, scrollDown]);

  const search = useCallback(async (q: AssistantSearchQuery) => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(q)) if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) params[k] = Array.isArray(v) ? v.join(',') : String(v);
    return (await http.get<AssistantSearchResult>('/assistant/search', { params })).data;
  }, []);

  const historyFor = (list: Msg[]) =>
    list.slice(-8).map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.role === 'user' ? m.text ?? '' : plainOf(m.reply).slice(0, 800) })).filter((m) => m.content);

  const say = (reply: Reply) => setMsgs((list) => [...list, { id: uid(), role: 'kai', reply, at: Date.now(), fresh: true }]);

  const send = async (raw: string) => {
    let text = raw.trim();
    if (!text || busy) return;
    setInput('');
    // Quick commands.
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.split(/\s+/);
      const arg = rest.join(' ');
      if (cmd === '/moi') return newChat();
      if (cmd === '/ai') return setDeepOpen(true);
      if (cmd === '/huongdan') {
        setMsgs((l) => [...l, { id: uid(), role: 'user', text, at: Date.now() }]);
        say({ kind: 'kb', mood: 'happy', blocks: [{ k: 'text', md: `Mình hướng dẫn được **${KB.length} chủ đề**. Chọn một chủ đề bên dưới, hoặc cứ hỏi tự nhiên nhé:` }], chips: KB.map((a) => a.title) });
        return;
      }
      if (cmd === '/gpa') text = arg ? `${arg} là điểm gì` : 'Tính GPA';
      else if (cmd === '/tim') text = arg ? `tìm ${arg}` : 'Tìm tài liệu trong Thư viện';
    }
    lastSent.current = raw.trim();
    const userMsg: Msg = { id: uid(), role: 'user', text: raw.trim(), at: Date.now() };
    const kaiId = uid();
    const before = msgs;
    setMsgs((l) => [...l.map((m) => ({ ...m, fresh: false })), userMsg]);
    setBusy(true);
    setWaiting(true);
    setMood('think');
    setAtBottom(true);
    const started = performance.now();
    let placed = false;
    const emit = (r: Reply) => {
      setWaiting(false);
      setMood('talk');
      setMsgs((l) => (placed ? l.map((m) => (m.id === kaiId ? { ...m, reply: r } : m)) : [...l, { id: kaiId, role: 'kai', reply: r, at: Date.now(), fresh: false }]));
      placed = true;
    };
    try {
      const deps = {
        search,
        history: historyFor(before),
        ...(llm.s === 'ready' ? { llm: { model: llm.label, generate } } : {}),
      };
      const { reply, ctx } = await respond(text, { ...ctxRef.current, path: loc.pathname, userName: user?.name }, deps, emit);
      ctxRef.current = ctx;
      // A short beat so the answer feels considered rather than flashed.
      const wait = Math.max(0, 380 - (performance.now() - started));
      if (wait && !placed) await new Promise((r) => setTimeout(r, wait));
      setMsgs((l) => (placed ? l.map((m) => (m.id === kaiId ? { ...m, reply, fresh: false } : m)) : [...l, { id: kaiId, role: 'kai', reply, at: Date.now(), fresh: true }]));
      flash(reply.mood ?? 'happy', reply.kind === 'fallback' ? 2200 : 2800);
      if (reply.kind !== 'fallback') {
        zapCount.current = 0;
        setZapKey((k) => k + 1);
      }
      if (reply.navigate) {
        const to = reply.navigate;
        setTimeout(() => {
          nav(to);
          if (mobile) setOpen(false);
        }, 650);
      }
    } catch (e) {
      setMsgs((l) => [...l, { id: kaiId, role: 'kai', at: Date.now(), fresh: true, reply: { kind: 'fallback', mood: 'sorry', blocks: [{ k: 'text', md: `Ối, mình gặp lỗi: ${(e as Error).message}. Thử lại nhé.` }] } }]);
      flash('sorry');
    } finally {
      setBusy(false);
      setWaiting(false);
    }
  };

  const newChat = () => {
    interrupt();
    setMsgs([]);
    ctxRef.current = { path: loc.pathname };
    flash('wave', 1800);
    field.current?.focus();
  };

  const onGo = () => {
    if (mobile) setOpen(false);
  };

  const feedback = (id: string, v: 1 | -1) => {
    setMsgs((l) => l.map((m) => (m.id === id ? { ...m, fb: m.fb === v ? undefined : v } : m)));
    const m = msgs.find((x) => x.id === id);
    const i = msgs.findIndex((x) => x.id === id);
    const q = msgs.slice(0, i).reverse().find((x) => x.role === 'user')?.text;
    const log = read<{ items: unknown[] }>('kai:fb', { items: [] });
    write('kai:fb', { items: [...log.items.slice(-99), { q, v, kind: m?.reply?.kind, article: m?.reply?.articleId, at: Date.now() }] });
    showToast(v > 0 ? 'Cảm ơn bạn! Kai sẽ nhớ cách trả lời này.' : 'Cảm ơn góp ý, Kai sẽ cải thiện.');
    flash(v > 0 ? 'happy' : 'sorry', 1600);
  };
  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(''), 2200);
  };
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      showToast('Đã chép');
    } catch {
      showToast('Không chép được');
    }
  };
  const speak = (t: string) => {
    if (!('speechSynthesis' in window)) return showToast('Trình duyệt không hỗ trợ đọc to');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t.slice(0, 1200));
    u.lang = 'vi-VN';
    const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith('vi'));
    if (v) u.voice = v;
    u.rate = 1.05;
    u.onstart = () => setMood('talk');
    u.onend = () => setMood('idle');
    speechSynthesis.speak(u);
  };

  const Speech = useMemo(() => speechCtor(), []);
  const toggleMic = () => {
    if (!Speech) return;
    if (listening) {
      recog.current?.stop();
      return;
    }
    const r = new Speech();
    r.lang = 'vi-VN';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i]![0]!.transcript;
      finalText = t;
      setInput(t);
    };
    r.onend = () => {
      setListening(false);
      setMood('idle');
      if (finalText.trim()) void send(finalText);
    };
    r.onerror = () => {
      setListening(false);
      setMood('idle');
      showToast('Không nghe được, thử lại nhé');
    };
    recog.current = r;
    setListening(true);
    setMood('listen');
    r.start();
  };

  /* ── dragging the launcher and the panel ── */
  const dragLauncher = useRef<{ x0: number; y0: number; moved: boolean; id: number } | null>(null);
  const [lpos, setLpos] = useState<{ x: number; y: number } | null>(null);
  const onLauncherDown = (e: React.PointerEvent) => {
    dragLauncher.current = { x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onLauncherMove = (e: React.PointerEvent) => {
    const d = dragLauncher.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    d.moved = true;
    setGreet(false);
    setLpos({ x: e.clientX, y: e.clientY });
  };
  const onLauncherUp = (e: React.PointerEvent) => {
    const d = dragLauncher.current;
    dragLauncher.current = null;
    if (!d) return;
    if (!d.moved) {
      setOpen(true);
      return;
    }
    flipFrom.current = launcherRef.current?.getBoundingClientRect() ?? null;
    const side = e.clientX < innerWidth / 2 ? 'left' : 'right';
    const bottom = Math.round(Math.min(innerHeight - 90, Math.max(12, innerHeight - e.clientY - 34)));
    setPrefs((p) => ({ ...p, launcher: { side, bottom } }));
    setLpos(null);
    flash('happy', 1200);
  };

  // Glide to the edge after a drop instead of jumping there.
  const flipFrom = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const from = flipFrom.current;
    const el = launcherRef.current;
    if (!from || !el || lpos) return;
    flipFrom.current = null;
    const to = el.getBoundingClientRect();
    el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2, 1.25, .4, 1)' });
  }, [prefs.launcher, lpos]);

  const box = prefs.box;
  const boxRef = useRef(box);
  boxRef.current = box;
  const defaultBox = () => {
    const w = Math.min(420, innerWidth - 32);
    const h = Math.min(680, innerHeight - 32);
    return { x: innerWidth - w - 20, y: innerHeight - h - 20, w, h };
  };
  const clampBox = (b: { x: number; y: number; w: number; h: number }) => {
    const w = Math.min(Math.max(340, b.w), innerWidth - 16);
    const h = Math.min(Math.max(420, b.h), innerHeight - 16);
    return { w, h, x: Math.min(Math.max(8, b.x), innerWidth - w - 8), y: Math.min(Math.max(8, b.y), innerHeight - h - 8) };
  };
  useEffect(() => {
    const on = () => boxRef.current && setPrefs((p) => (p.box ? { ...p, box: clampBox(p.box) } : p));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const startMove = (e: React.PointerEvent) => {
    if (mobile || prefs.xl || (e.target as HTMLElement).closest('button,a,input,textarea')) return;
    const b0 = box ?? defaultBox();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    panel.current?.classList.add('is-dragging');
    const move = (ev: PointerEvent) => setPrefs((p) => ({ ...p, box: clampBox({ ...b0, x: b0.x + ev.clientX - x0, y: b0.y + ev.clientY - y0 }) }));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      panel.current?.classList.remove('is-dragging');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const b0 = box ?? defaultBox();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    panel.current?.classList.add('is-dragging');
    // The corner is top-left: the bottom-right edge stays put.
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      setPrefs((p) => ({ ...p, xl: false, box: clampBox({ x: b0.x + dx, y: b0.y + dy, w: b0.w - dx, h: b0.h - dy }) }));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      panel.current?.classList.remove('is-dragging');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  // Mobile sheet: pull the handle down to close.
  const sheetDrag = useRef<{ y0: number } | null>(null);
  const [pull, setPull] = useState(0);
  const onGrabDown = (e: React.PointerEvent) => {
    if (!mobile) return;
    sheetDrag.current = { y0: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGrabMove = (e: React.PointerEvent) => sheetDrag.current && setPull(Math.max(0, e.clientY - sheetDrag.current.y0));
  const onGrabUp = () => {
    if (!sheetDrag.current) return;
    sheetDrag.current = null;
    if (pull > 110) setOpen(false);
    setPull(0);
  };

  const panelStyle: CSSProperties = useMemo(() => {
    if (mobile) return pull ? { transform: `translateY(${pull}px)`, transition: 'none' } : {};
    if (prefs.xl) {
      const w = Math.min(760, innerWidth - 48);
      return { left: innerWidth - w - 24, top: 24, width: w, height: innerHeight - 48 };
    }
    const b = box ?? defaultBox();
    return { left: b.x, top: b.y, width: b.w, height: b.h };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, prefs.xl, box, pull, open]);

  // The panel grows out of the launcher.
  const origin = useMemo(() => {
    if (mobile) return 'bottom center';
    const s = panelStyle as { left?: number; top?: number };
    const lx = prefs.launcher.side === 'right' ? innerWidth - 50 : 50;
    const ly = innerHeight - prefs.launcher.bottom - 30;
    return `${lx - (s.left ?? 0)}px ${ly - (s.top ?? 0)}px`;
  }, [mobile, panelStyle, prefs.launcher]);

  const last = msgs[msgs.length - 1];
  const chips = !busy && last?.role === 'kai' ? last.reply?.chips ?? [] : [];
  const deepReady = llm.s === 'ready';
  const headMood: BotMood = listening ? 'listen' : waiting ? 'think' : mood === 'sleep' ? 'idle' : mood;
  const statusText = listening
    ? 'Đang nghe…'
    : waiting
      ? 'Đang tìm câu trả lời…'
      : llm.s === 'loading'
        ? `Đang bật AI sâu ${Math.round(llm.progress * 100)}%`
        : deepReady
          ? `AI sâu · ${llm.label}`
          : 'Sẵn sàng · chạy trên máy bạn';
  const cmdMenu = input.startsWith('/') && !input.includes(' ') ? COMMANDS.filter((c) => c.cmd.startsWith(input.toLowerCase())) : [];

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  if (hidden) return null;

  return (
    <>
      {/* launcher */}
      <button
        ref={launcherRef}
        type="button"
        className={cn('kai-launcher', open && 'is-away', lpos && 'is-drag', launcherZap && 'is-zap', `is-${prefs.launcher.side}`)}
        style={lpos ? ({ left: lpos.x - 34, top: lpos.y - 34, right: 'auto', bottom: 'auto' } as CSSProperties) : ({ [prefs.launcher.side]: 18, bottom: prefs.launcher.bottom } as CSSProperties)}
        onPointerDown={onLauncherDown}
        onPointerMove={onLauncherMove}
        onPointerUp={onLauncherUp}
        onMouseEnter={() => mood !== 'sleep' && flash('wave', 1600)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(true))}
        aria-label="Mở trợ lý Kai (Alt+K)"
        aria-expanded={open}
        title="Hỏi Kai (Alt+K)"
      >
        <span className="kai-launcher-halo" aria-hidden />
        <span className="kai-hud" aria-hidden><i /><i /></span>
        <span className="kai-sparks" aria-hidden><i /><i /><i /><i /><i /></span>
        <KaiBot mood={mood} size={62} zap={!open} onZap={onLauncherZap} />
        <span className="kai-launcher-shadow" aria-hidden />
      </button>
      {greet && !open && (
        <div className={cn('kai-greet', `is-${prefs.launcher.side}`)} style={{ bottom: prefs.launcher.bottom + 78 }} role="status">
          <button type="button" className="kai-greet-x" onClick={() => setGreet(false)} aria-label="Ẩn lời chào"><X className="ic ic-xs" /></button>
          <b>Chào {firstName || 'bạn'}! Mình là Kai</b>
          <span>Cần tìm đề thi, bài tập hay hỏi cách dùng Kaned? Bấm vào mình nhé.</span>
        </div>
      )}

      {shown && (
        <div
          ref={panel}
          className={cn('kai-panel', open ? 'is-open' : 'is-closing', mobile && 'is-sheet', prefs.xl && !mobile && 'is-xl')}
          style={{ ...panelStyle, transformOrigin: origin }}
          role="dialog"
          aria-label="Trợ lý Kai"
        >
          <svg ref={frameSvg} className="kai-frame" aria-hidden preserveAspectRatio="none">
            <defs>
              <filter id="kai-frame-blur" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="2.2" />
              </filter>
            </defs>
            <rect className="kai-frame-glow" pathLength={1000} filter="url(#kai-frame-blur)" />
            <rect className="kai-frame-core" pathLength={1000} />
            <rect className="kai-frame-hot" pathLength={1000} />
          </svg>
          <header ref={headRef} className="kai-head" onPointerDown={startMove} onDoubleClick={() => !mobile && setPrefs((p) => ({ ...p, xl: !p.xl }))}>
            <svg ref={arcSvg} className="kai-arc" aria-hidden>
              <defs>
                <filter id="kai-arc-blur" x="-20%" y="-60%" width="140%" height="220%">
                  <feGaussianBlur stdDeviation="2.2" />
                </filter>
              </defs>
              <g ref={arcG} />
            </svg>
            {mobile && <span className="kai-grab" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} aria-hidden />}
            <span className="kai-head-bot"><KaiBot mood={headMood} size={44} zap={open} zapKey={zapKey} onZap={onHeadZap} /></span>
            <div className="kai-head-text">
              <b><span className="kai-name">Kai</span> <span className={cn('kai-badge', deepReady && 'is-deep')}>{deepReady ? 'AI sâu' : 'AI · local'}</span></b>
              <small><i className={cn('kai-dot', (waiting || llm.s === 'loading') && 'is-busy')} />{statusText}</small>
            </div>
            <div className="kai-head-btns">
              <button type="button" className={cn('kai-hb', deepReady && 'is-on')} onClick={() => setDeepOpen(true)} title="AI sâu trên máy bạn" aria-label="AI sâu"><Sparkles className="ic ic-sm" /></button>
              <button type="button" className="kai-hb" onClick={newChat} title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới"><SquarePen className="ic ic-sm" /></button>
              {!mobile && (
                <button type="button" className="kai-hb" onClick={() => setPrefs((p) => ({ ...p, xl: !p.xl }))} title={prefs.xl ? 'Thu nhỏ' : 'Phóng to'} aria-label={prefs.xl ? 'Thu nhỏ' : 'Phóng to'}>
                  {prefs.xl ? <Minimize2 className="ic ic-sm" /> : <Maximize2 className="ic ic-sm" />}
                </button>
              )}
              <button type="button" className="kai-hb" onClick={() => setOpen(false)} title="Đóng (Esc)" aria-label="Đóng"><X className="ic ic-sm" /></button>
            </div>
          </header>

          <div className="kai-scroll" ref={scroller} onScroll={onScroll} aria-live="polite">
            {msgs.length === 0 ? (
              <div className="kai-welcome">
                <div className="kai-welcome-bot">
                  <span className="kai-orbit" aria-hidden><i /><i /><i /></span>
                  <KaiBot mood={mood === 'idle' ? 'wave' : headMood} size={96} zap />
                </div>
                <h2>Chào {firstName || 'bạn'}, mình là Kai</h2>
                <p>Hỏi mình cách dùng Kaned, hoặc nhờ mình tìm đề thi, bài tập, slide, flashcard, môn học và giảng viên.</p>
                <div className="kai-sugg">
                  {suggestionsFor(loc.pathname).map((s, i) => (
                    <button key={s.text} type="button" onClick={() => void send(s.text)} style={{ '--d': `${i * 50}ms` } as CSSProperties}>
                      <s.icon className="ic ic-sm" /><span>{s.text}</span>
                    </button>
                  ))}
                </div>
                <p className="kai-tip"><kbd>Alt</kbd>+<kbd>K</kbd> mở Kai · gõ <kbd>/</kbd> xem lệnh nhanh</p>
              </div>
            ) : (
              msgs.map((m, i) => (
                <MessageView
                  key={m.id}
                  m={m}
                  isLast={i === msgs.length - 1}
                  onGo={onGo}
                  onFb={feedback}
                  onCopy={copy}
                  onSpeak={speak}
                  onStop={interrupt}
                />
              ))
            )}
            {waiting && (
              <div className="kai-row is-kai kai-typing" aria-label="Kai đang trả lời">
                <span className="kai-av"><KaiBot mood="think" size={30} track={false} /></span>
                <div className="kai-bubble">
                  <svg className="kai-scope" viewBox="0 0 64 20" aria-hidden>
                    <path d="M0 10 Q4 1 8 10 T16 10 T24 10 T32 10 T40 10 T48 10 T56 10 T64 10 T72 10 T80 10 T88 10 T96 10" />
                  </svg>
                  <span>Kai đang xử lý…</span>
                </div>
              </div>
            )}
          </div>

          {!atBottom && (
            <button type="button" className="kai-jump" onClick={() => (setAtBottom(true), scrollDown())} aria-label="Xuống tin mới nhất"><ArrowDown className="ic ic-sm" /></button>
          )}

          {chips.length > 0 && (
            <div className="kai-chips" role="list">
              {chips.map((c, i) => (
                <button key={c} type="button" role="listitem" onClick={() => void send(c)} style={{ '--d': `${i * 40}ms` } as CSSProperties}>{c}</button>
              ))}
            </div>
          )}

          <footer className="kai-foot">
            {cmdMenu.length > 0 && (
              <ul className="kai-cmds" role="listbox">
                {cmdMenu.map((c) => (
                  <li key={c.cmd}>
                    <button type="button" onClick={() => (setInput(`${c.cmd} `), field.current?.focus(), ['/moi', '/ai', '/huongdan'].includes(c.cmd) && void send(c.cmd))}>
                      <b>{c.cmd}</b><span>{c.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className={cn('kai-input', listening && 'is-listening')}
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <textarea
                ref={field}
                rows={1}
                value={input}
                maxLength={500}
                placeholder={listening ? 'Đang nghe, bạn nói đi…' : PLACEHOLDERS[ph]}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  } else if (e.key === 'ArrowUp' && !input && lastSent.current) {
                    e.preventDefault();
                    setInput(lastSent.current);
                  }
                }}
                aria-label="Nhập câu hỏi cho Kai"
              />
              {Speech && (
                <button type="button" className={cn('kai-ib', listening && 'is-on')} onClick={toggleMic} aria-label={listening ? 'Dừng nghe' : 'Nói với Kai'} title="Nói (tiếng Việt)"><Mic className="ic ic-sm" /></button>
              )}
              {busy && msgs[msgs.length - 1]?.reply?.kind === 'llm' ? (
                <button type="button" className="kai-send is-stop" onClick={interrupt} aria-label="Dừng"><Square className="ic ic-sm" /></button>
              ) : (
                <button type="submit" className="kai-send" disabled={!input.trim() || busy} aria-label="Gửi"><ArrowUp className="ic ic-sm" /></button>
              )}
            </form>
            <small className="kai-fine">Kai có thể nhầm · trò chuyện chỉ lưu trên máy bạn</small>
          </footer>

          {!mobile && !prefs.xl && <span className="kai-resize" onPointerDown={startResize} aria-hidden title="Kéo để đổi kích thước" />}
          {toast && <div className="kai-toast" role="status">{toast}</div>}
          {deepOpen && <DeepSheet prefs={prefs} setPrefs={setPrefs} onClose={() => setDeepOpen(false)} />}
        </div>
      )}
    </>
  );
}

/* ───────────────────────────── a message ───────────────────────────── */

function MessageView({ m, isLast, onGo, onFb, onCopy, onSpeak, onStop }: { m: Msg; isLast: boolean; onGo: () => void; onFb: (id: string, v: 1 | -1) => void; onCopy: (t: string) => void; onSpeak: (t: string) => void; onStop: () => void }) {
  if (m.role === 'user') {
    return (
      <div className="kai-row is-user">
        <div className="kai-bubble">{m.text}</div>
      </div>
    );
  }
  const r = m.reply;
  if (!r || !r.blocks.length) return null;
  const live = r.blocks.some((b: Block) => b.k === 'llm' && !b.done);
  const text = plainOf(r);
  return (
    <div className={cn('kai-row is-kai', m.fresh && 'is-fresh')}>
      <span className="kai-av"><KaiBot mood={live ? 'talk' : isLast ? (r.mood === 'sorry' ? 'sorry' : 'happy') : 'idle'} size={30} track={isLast} /></span>
      <div className="kai-msg">
        <Blocks blocks={r.blocks} fresh={Boolean(m.fresh)} onGo={onGo} onStop={onStop} onCopyCode={onCopy} />
        {!live && text && (
          <div className="kai-tools">
            <button type="button" onClick={() => onCopy(text)} title="Chép" aria-label="Chép câu trả lời"><Copy className="ic ic-xs" /></button>
            <button type="button" onClick={() => onSpeak(text)} title="Đọc to" aria-label="Đọc to"><Volume2 className="ic ic-xs" /></button>
            <button type="button" className={cn(m.fb === 1 && 'is-on')} onClick={() => onFb(m.id, 1)} title="Hữu ích" aria-label="Hữu ích"><ThumbsUp className="ic ic-xs" /></button>
            <button type="button" className={cn(m.fb === -1 && 'is-on is-down')} onClick={() => onFb(m.id, -1)} title="Chưa đúng" aria-label="Chưa đúng"><ThumbsDown className="ic ic-xs" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── AI sâu settings ───────────────────────────── */

function DeepSheet({ prefs, setPrefs, onClose }: { prefs: Prefs; setPrefs: React.Dispatch<React.SetStateAction<Prefs>>; onClose: () => void }) {
  const llm = useSyncExternalStore(llmStore.subscribe, llmStore.get);
  const [gpu, setGpu] = useState<{ ok: boolean; f16: boolean; reason?: string } | null>(null);
  const [cached, setCached] = useState<Record<string, boolean>>({});
  useEffect(() => {
    void webgpuSupport().then(setGpu);
    void Promise.all(MODELS.map(async (m) => [m.key, await isCached(m)] as const)).then((r) => setCached(Object.fromEntries(r)));
  }, [llm.s]);
  const choice = MODELS.find((m) => m.key === prefs.model) ?? MODELS[1]!;
  const enable = async () => {
    setPrefs((p) => ({ ...p, deep: true }));
    await loadModel(choice);
  };
  const disable = () => {
    setPrefs((p) => ({ ...p, deep: false }));
    turnOff();
  };
  return (
    <div className="kai-sheet" role="dialog" aria-label="AI sâu">
      <div className="kai-sheet-card">
        <header>
          <span className="kai-sheet-ic"><Cpu className="ic" /></span>
          <div><b>AI sâu trên máy bạn</b><small>Giải thích kiến thức, trả lời câu hỏi mở</small></div>
          <button type="button" className="kai-hb" onClick={onClose} aria-label="Đóng"><X className="ic ic-sm" /></button>
        </header>
        <ul className="kai-sheet-points">
          <li><b>Riêng tư:</b> mô hình ngôn ngữ chạy ngay trong trình duyệt bằng GPU, câu hỏi không gửi ra ngoài.</li>
          <li><b>Tải một lần:</b> lần đầu tải mô hình, những lần sau mở ngay từ bộ nhớ máy.</li>
          <li><b>Cần WebGPU:</b> Chrome hoặc Edge bản mới trên máy tính; điện thoại có thể chưa chạy được.</li>
        </ul>
        {gpu && !gpu.ok && <p className="kai-sheet-warn">{gpu.reason}</p>}
        <div className="kai-models" role="radiogroup" aria-label="Chọn mô hình">
          {MODELS.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={prefs.model === m.key} className={cn('kai-model', prefs.model === m.key && 'is-on')} onClick={() => setPrefs((p) => ({ ...p, model: m.key }))} disabled={llm.s === 'loading'}>
              <b>{m.label}{m.key === 'balanced' && <em>Khuyên dùng</em>}</b>
              <small>{m.base} · {m.size}{cached[m.key] ? ' · đã có trên máy' : ''}</small>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
        {llm.s === 'loading' && (
          <div className="kai-load">
            <div className="kai-load-top"><span>{llm.text}</span><b>{Math.round(llm.progress * 100)}%</b></div>
            <i className="kai-load-bar"><i style={{ width: `${Math.max(3, llm.progress * 100)}%` }} /></i>
          </div>
        )}
        {llm.s === 'error' && <p className="kai-sheet-warn">{llm.message}</p>}
        {llm.s === 'unsupported' && <p className="kai-sheet-warn">{llm.reason}</p>}
        {llm.s === 'ready' && <p className="kai-sheet-ok"><Sparkles className="ic ic-xs" /> Đang bật: {llm.label}. Hỏi mình kiến thức bất kỳ nhé.</p>}
        <div className="kai-sheet-btns">
          {llm.s === 'ready' ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={disable}>Tắt AI sâu</button>
              <button type="button" className="btn btn-primary" onClick={onClose}>Xong</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-block" disabled={llm.s === 'loading' || llm.s === 'checking' || (gpu != null && !gpu.ok)} onClick={() => void enable()}>
              {llm.s === 'loading' ? 'Đang bật…' : cached[choice.key] ? `Bật AI sâu (${choice.label})` : `Tải và bật (${choice.size})`}
            </button>
          )}
        </div>
        {Object.values(cached).some(Boolean) && llm.s !== 'loading' && (
          <button type="button" className="kai-forget" onClick={() => void Promise.all(MODELS.filter((m) => cached[m.key]).map((m) => forget(m))).then(() => setCached({}))}>
            Xoá mô hình đã tải khỏi máy
          </button>
        )}
      </div>
    </div>
  );
}
