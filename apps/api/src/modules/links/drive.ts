import type { DriveEntryDto, DriveFolderDto } from '@kaned/shared';

/**
 * Lists a Google Drive folder that is shared with "anyone with the link".
 * With GOOGLE_API_KEY set it uses the Drive API (sizes, exact times);
 * without one it reads the public embedded folder page. Only Google hosts
 * are fetched and the id is checked first, so this cannot be aimed elsewhere.
 */

const TIMEOUT = 6000;
const TTL = 5 * 60_000;
const MAX = 300;
const ID = /^[\w-]{10,80}$/;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const cache = new Map<string, { at: number; value: DriveFolderDto }>();

export const isDriveId = (id: string) => ID.test(id);

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

/** The embedded folder page: one block per entry. Exported for tests. */
export function parseEmbeddedFolder(html: string): { name: string | null; entries: DriveEntryDto[] } {
  const entries: DriveEntryDto[] = [];
  const parts = html.split(/class="flip-entry"/).slice(1);
  for (const part of parts) {
    const id = part.match(/id="entry-([\w-]+)"/)?.[1];
    const name = part.match(/class="flip-entry-title">([^<]*)</)?.[1];
    if (!id || !name) continue;
    const href = part.match(/href="([^"]+)"/)?.[1] ?? '';
    const isFolder = /\/folders\//.test(href);
    const when = part.match(/class="flip-entry-last-modified"><div>([^<]*)</)?.[1];
    entries.push({
      id,
      name: decode(name),
      kind: isFolder ? 'folder' : 'file',
      mime: null,
      size: null,
      modifiedAt: null,
      modifiedText: when ? decode(when) : null,
    });
  }
  const title = html.match(/<title>([^<]*)</)?.[1];
  return { name: title ? decode(title) : null, entries };
}

async function viaApi(id: string, key: string): Promise<DriveFolderDto> {
  const base: DriveFolderDto = { id, name: null, entries: [], status: 'unknown', truncated: false };
  const get = async (u: string) => {
    try {
      return await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
    } catch {
      return null;
    }
  };
  const meta = await get(`https://www.googleapis.com/drive/v3/files/${id}?fields=name&supportsAllDrives=true&key=${encodeURIComponent(key)}`);
  if (!meta) return base;
  if (meta.status === 403 || meta.status === 404) return { ...base, status: 'private' };
  if (!meta.ok) return base;
  const name = ((await meta.json()) as { name?: string }).name ?? null;
  const entries: DriveEntryDto[] = [];
  let token = '';
  let truncated = false;
  do {
    const q = encodeURIComponent(`'${id}' in parents and trashed=false`);
    const r = await get(
      `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=100&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true` +
        `&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)&key=${encodeURIComponent(key)}${token ? `&pageToken=${token}` : ''}`,
    );
    if (!r?.ok) return entries.length ? { ...base, name, entries, status: 'ok', truncated: true } : { ...base, name };
    const body = (await r.json()) as { nextPageToken?: string; files?: Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }> };
    for (const f of body.files ?? []) {
      entries.push({
        id: f.id,
        name: f.name,
        kind: f.mimeType === FOLDER_MIME ? 'folder' : 'file',
        mime: f.mimeType === FOLDER_MIME ? null : f.mimeType,
        size: f.size ? Number(f.size) : null,
        modifiedAt: f.modifiedTime ?? null,
      });
    }
    token = body.nextPageToken ?? '';
    if (entries.length >= MAX) {
      truncated = Boolean(token);
      break;
    }
  } while (token);
  return { id, name, entries: entries.slice(0, MAX), status: 'ok', truncated };
}

async function viaPage(id: string): Promise<DriveFolderDto> {
  const base: DriveFolderDto = { id, name: null, entries: [], status: 'unknown', truncated: false };
  let r: Response;
  try {
    r = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'accept-language': 'vi,en;q=0.8' },
    });
  } catch {
    return base;
  }
  if (r.status === 403 || r.status === 404) return { ...base, status: 'private' };
  if (!r.ok) return base;
  const { name, entries } = parseEmbeddedFolder(await r.text());
  // An empty page is either an empty folder or a private one; Google serves no entries to both.
  return { id, name, entries: entries.slice(0, MAX), status: 'ok', truncated: entries.length > MAX };
}

export async function listDriveFolder(id: string): Promise<DriveFolderDto> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const key = process.env.GOOGLE_API_KEY?.trim();
  const value = key ? await viaApi(id, key) : await viaPage(id);
  if (value.status === 'ok') cache.set(id, { at: Date.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return value;
}
