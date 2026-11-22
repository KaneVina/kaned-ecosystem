const TIMEOUT = 8000;
const CACHE_MAX = 500;
const cache = new Map<string, TranslateResult>();

export interface TranslateResult {
  text: string;
  /** Language the selection was written in, as the provider detected it (ISO 639-1). */
  from: string;
  to: string;
}

const VI_MARKS = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

async function viaGoogle(text: string, to: string): Promise<TranslateResult> {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.search = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: to, dt: 't', q: text }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { 'user-agent': 'Mozilla/5.0 (Kaned)' } });
  if (!r.ok) throw new Error(`google ${r.status}`);
  const data = (await r.json()) as [Array<[string]>, unknown, string];
  const out = (data[0] ?? []).map((p) => p?.[0] ?? '').join('');
  if (!out) throw new Error('google empty');
  return { text: out, from: typeof data[2] === 'string' ? data[2] : 'auto', to };
}

/** Backup when the first provider is down: it has no auto-detect, so guess vi vs en from the text. */
async function viaMyMemory(text: string, to: string): Promise<TranslateResult> {
  const from = VI_MARKS.test(text) ? 'vi' : 'en';
  if (from === to) return { text, from, to };
  const url = new URL('https://api.mymemory.translated.net/get');
  url.search = new URLSearchParams({ q: text.slice(0, 480), langpair: `${from}|${to}` }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`mymemory ${r.status}`);
  const data = (await r.json()) as { responseData?: { translatedText?: string } };
  const out = data.responseData?.translatedText;
  if (!out) throw new Error('mymemory empty');
  return { text: out, from, to };
}

export async function translate(text: string, to: string): Promise<TranslateResult> {
  const key = `${to}\n${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let res: TranslateResult;
  try {
    res = await viaGoogle(text, to);
  } catch {
    res = await viaMyMemory(text, to);
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, res);
  return res;
}
