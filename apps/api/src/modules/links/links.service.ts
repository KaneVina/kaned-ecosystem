import { canvaEmbedUrl, detectLinkProvider, isWebUrl, parseCanva, parseYoutube, type LinkPreviewDto } from '@kaned/shared';

/**
 * Looks up YouTube and Canva links through their public oEmbed endpoints:
 * title, author, cover picture, and whether other people can view it.
 * Only these two hosts are ever fetched, so this cannot be pointed at
 * arbitrary addresses.
 */

const TIMEOUT = 5000;
const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; value: LinkPreviewDto }>();

const CANVA_OEMBED = ['https://api.canva.com/_spi/presentation/_oembed', 'https://www.canva.com/_oembed'];

async function getJson(url: string): Promise<{ status: number; body: Record<string, unknown> | null }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' } });
    if (!r.ok) return { status: r.status, body: null };
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  } catch {
    return { status: 0, body: null };
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const httpsUrl = (v: unknown) => {
  const s = str(v);
  return s && /^https:\/\//.test(s) ? s : null;
};

/** Follows a canva.link short link to the design it points at, staying on Canva hosts. */
async function followCanvaLink(raw: string): Promise<string | null> {
  let url = raw;
  for (let i = 0; i < 5; i++) {
    let r: Response;
    try {
      r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
    } catch {
      return null;
    }
    const loc = r.headers.get('location');
    if (!loc || r.status < 300 || r.status >= 400) return null;
    const next = new URL(loc, url);
    const host = next.hostname.replace(/^www\./, '');
    if (next.protocol !== 'https:' || (host !== 'canva.com' && host !== 'canva.link')) return null;
    if (parseCanva(next.href)) return next.href;
    url = next.href;
  }
  return null;
}

async function youtube(url: string): Promise<LinkPreviewDto> {
  const provider = detectLinkProvider(url);
  const y = parseYoutube(url);
  const base: LinkPreviewDto = { url, provider, title: null, author: null, thumbnailUrl: provider.thumbnailUrl ?? null, status: 'unknown' };
  if (!y) return { ...base, status: 'missing' };
  const canonical = y.id ? `https://www.youtube.com/watch?v=${y.id}` : `https://www.youtube.com/playlist?list=${y.list}`;
  const { status, body } = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonical)}`);
  if (body) {
    return {
      ...base,
      title: str(body.title),
      author: str(body.author_name),
      thumbnailUrl: base.thumbnailUrl ?? httpsUrl(body.thumbnail_url),
      status: 'ok',
    };
  }
  // 401/403: private, or the owner turned embedding off. 400/404: no such video.
  return { ...base, status: status === 401 || status === 403 ? 'private' : status === 400 || status === 404 ? 'missing' : 'unknown' };
}

async function canva(raw: string): Promise<LinkPreviewDto> {
  let url = raw;
  if (detectLinkProvider(raw).needsResolve) {
    const followed = await followCanvaLink(raw);
    if (!followed) {
      return { url: raw, provider: detectLinkProvider(raw), title: null, author: null, thumbnailUrl: null, status: 'unknown' };
    }
    url = followed;
  }
  const c = parseCanva(url)!;
  const view = `https://www.canva.com/design/${c.id}${c.token ? `/${c.token}` : ''}/view`;
  const provider = detectLinkProvider(view);
  let last = 0;
  for (const endpoint of CANVA_OEMBED) {
    const { status, body } = await getJson(`${endpoint}?format=json&url=${encodeURIComponent(view)}`);
    last = status;
    if (!body) continue;
    // Prefer the iframe address Canva itself hands out.
    const src = str(body.html)?.match(/src="(https:\/\/www\.canva\.com\/design\/[^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    const w = Number(body.width);
    const h = Number(body.height);
    return {
      url: view,
      provider: {
        ...provider,
        embedUrl: src ?? canvaEmbedUrl(c),
        ratio: w > 0 && h > 0 ? Math.min(3, Math.max(0.5, w / h)) : provider.ratio,
      },
      title: str(body.title),
      author: str(body.author_name),
      thumbnailUrl: httpsUrl(body.thumbnail_url),
      status: 'ok',
    };
  }
  const status = last === 401 || last === 403 || last === 404 ? 'private' : 'unknown';
  return { url: view, provider, title: null, author: null, thumbnailUrl: null, status };
}

export async function previewLink(raw: string): Promise<LinkPreviewDto> {
  const url = raw.trim();
  const provider = isWebUrl(url) ? detectLinkProvider(url) : null;
  if (!provider || (provider.id !== 'youtube' && provider.id !== 'canva')) {
    return { url, provider: detectLinkProvider(url), title: null, author: null, thumbnailUrl: null, status: 'unknown' };
  }
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = provider.id === 'youtube' ? await youtube(url) : await canva(url);
  // Only good answers are kept, so "Kiểm tra lại" sees a fix to the sharing settings at once.
  if (value.status === 'ok') cache.set(url, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}
