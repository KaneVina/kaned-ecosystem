import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm';

/**
 * "AI sâu": a small language model that runs entirely in the browser on the GPU (WebGPU),
 * loaded on demand. Nothing leaves the device; the model is cached by the browser after
 * the first download.
 */

export interface ModelChoice {
  key: 'light' | 'balanced' | 'strong';
  label: string;
  base: string;
  size: string;
  hint: string;
}
export const MODELS: ModelChoice[] = [
  { key: 'light', label: 'Nhẹ', base: 'Qwen3-0.6B', size: '≈ 350 MB', hint: 'Máy văn phòng, trả lời nhanh, giải thích đơn giản' },
  { key: 'balanced', label: 'Cân bằng', base: 'Qwen3-1.7B', size: '≈ 1 GB', hint: 'Khuyên dùng cho laptop có card đồ hoạ tích hợp' },
  { key: 'strong', label: 'Mạnh', base: 'Qwen3-4B', size: '≈ 2,3 GB', hint: 'Máy có GPU rời hoặc chip Apple M, giải thích kỹ nhất' },
];

export type LlmStatus =
  | { s: 'off' }
  | { s: 'checking' }
  | { s: 'unsupported'; reason: string }
  | { s: 'loading'; progress: number; text: string; model: string }
  | { s: 'ready'; model: string; label: string }
  | { s: 'error'; message: string };

let status: LlmStatus = { s: 'off' };
const subs = new Set<() => void>();
const set = (next: LlmStatus) => {
  status = next;
  subs.forEach((f) => f());
};
export const llmStore = {
  get: () => status,
  subscribe: (f: () => void) => {
    subs.add(f);
    return () => subs.delete(f);
  },
};

let engine: MLCEngineInterface | null = null;
let worker: Worker | null = null;
let f16 = true;

export async function webgpuSupport(): Promise<{ ok: boolean; f16: boolean; reason?: string }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: (o?: unknown) => Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu) return { ok: false, f16: false, reason: 'Trình duyệt này chưa hỗ trợ WebGPU. Dùng Chrome hoặc Edge bản mới (113 trở lên) trên máy tính.' };
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { ok: false, f16: false, reason: 'Không tìm thấy GPU dùng được cho WebGPU trên máy này.' };
    return { ok: true, f16: adapter.features.has('shader-f16') };
  } catch {
    return { ok: false, f16: false, reason: 'WebGPU đang bị tắt hoặc lỗi trên máy này.' };
  }
}

export const modelIdOf = (m: ModelChoice, half = f16) => `${m.base}-${half ? 'q4f16_1' : 'q4f32_1'}-MLC`;

/** Models this browser has finished downloading (kept here so checking never loads the 6 MB runtime). */
const CACHED_KEY = 'kai:llm:cached';
const cachedList = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CACHED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const markCached = (key: string, on: boolean) => {
  const set = new Set(cachedList());
  if (on) set.add(key);
  else set.delete(key);
  try {
    localStorage.setItem(CACHED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
};
export async function isCached(m: ModelChoice): Promise<boolean> {
  return cachedList().includes(m.key);
}

export async function loadModel(m: ModelChoice): Promise<boolean> {
  if (status.s === 'loading') return false;
  set({ s: 'checking' });
  const sup = await webgpuSupport();
  if (!sup.ok) {
    set({ s: 'unsupported', reason: sup.reason ?? 'Máy này chưa chạy được AI sâu.' });
    return false;
  }
  f16 = sup.f16;
  const id = modelIdOf(m);
  set({ s: 'loading', progress: 0, text: 'Đang chuẩn bị…', model: m.label });
  try {
    await unload();
    const lib = await import('@mlc-ai/web-llm');
    worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });
    engine = await lib.CreateWebWorkerMLCEngine(worker, id, {
      initProgressCallback: (r: InitProgressReport) => set({ s: 'loading', progress: r.progress, text: progressText(r.text), model: m.label }),
    });
    markCached(m.key, true);
    set({ s: 'ready', model: id, label: `${m.label} · ${m.base.replace('Qwen3-', 'Qwen3 ')}` });
    return true;
  } catch (e) {
    await unload();
    const msg = (e as Error)?.message ?? String(e);
    set({ s: 'error', message: /quota|storage/i.test(msg) ? 'Máy không đủ dung lượng lưu mô hình. Giải phóng ổ đĩa hoặc chọn mô hình Nhẹ.' : /device|lost|memory|oom/i.test(msg) ? 'GPU không đủ bộ nhớ cho mô hình này. Thử mô hình nhẹ hơn.' : `Không khởi động được: ${msg.slice(0, 160)}` });
    return false;
  }
}

/** web-llm reports in English; the useful part is the percentage and the stage. */
function progressText(t: string) {
  if (/fetch|download/i.test(t)) {
    const mb = /([\d.]+)\s*MB/i.exec(t);
    return `Đang tải mô hình${mb ? ` (${Math.round(Number(mb[1]))} MB)` : ''}… lần sau sẽ mở ngay`;
  }
  if (/cache/i.test(t)) return 'Đang đọc mô hình đã lưu trên máy…';
  if (/shader|compil|gpu/i.test(t)) return 'Đang chuẩn bị GPU…';
  return 'Đang khởi động…';
}

export async function unload() {
  try {
    await engine?.unload();
  } catch {
    /* already gone */
  }
  worker?.terminate();
  engine = null;
  worker = null;
  if (status.s === 'ready') set({ s: 'off' });
}

export function turnOff() {
  void unload().then(() => set({ s: 'off' }));
}

export async function forget(m: ModelChoice) {
  const lib = await import('@mlc-ai/web-llm');
  await unload();
  for (const half of [true, false]) await lib.deleteModelAllInfoInCache(modelIdOf(m, half)).catch(() => undefined);
  markCached(m.key, false);
  set({ s: 'off' });
}

export function interrupt() {
  try {
    engine?.interruptGenerate();
  } catch {
    /* nothing running */
  }
}

/** Streams an answer; onToken gets the whole text so far. Thinking blocks are left out. */
export async function generate(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, onToken: (text: string) => void): Promise<string> {
  if (!engine) throw new Error('AI sâu chưa sẵn sàng.');
  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.5,
    top_p: 0.9,
    max_tokens: 700,
    extra_body: { enable_thinking: false },
  } as Parameters<MLCEngineInterface['chat']['completions']['create']>[0] & { stream: true });
  let text = '';
  for await (const chunk of stream as AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>) {
    text += chunk.choices[0]?.delta?.content ?? '';
    onToken(clean(text));
  }
  return clean(text);
}

const clean = (t: string) => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '');
