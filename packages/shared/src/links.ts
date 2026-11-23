/**
 * Documents can be a link instead of a file: a Google Slides deck, a Canva
 * design, a YouTube lecture. This recognises the common hosts so the app can
 * name them and, where the host allows it, show them inline.
 */

export type LinkProviderId =
  | 'google-slides'
  | 'google-docs'
  | 'google-sheets'
  | 'google-drive'
  | 'youtube'
  | 'canva'
  | 'figma'
  | 'notion'
  | 'onedrive'
  | 'github'
  | 'web';

export interface LinkProvider {
  id: LinkProviderId;
  label: string;
  host: string;
  /** URL that renders inside an iframe, or null when the host forbids it. */
  embedUrl: string | null;
  /** Aspect ratio of the embed, width / height. */
  ratio: number;
  /** What it is, when it matters for the layout: a vertical Short, a playlist, a Canva design. */
  kind?: 'video' | 'short' | 'playlist' | 'design' | 'folder';
  /** Google Drive folder id, when the address is a folder. */
  folderId?: string;
  /** A picture to show on cards, when it can be worked out from the address alone. */
  thumbnailUrl?: string | null;
  /** A short link (canva.link) that must be followed on the server before it can be shown. */
  needsResolve?: boolean;
}

const YT_ID = /^[\w-]{11}$/;

/** "90", "90s", "1m30s", "1h2m3s" → seconds. */
function parseStart(v: string | null): number {
  if (!v) return 0;
  if (/^\d+s?$/.test(v)) return parseInt(v, 10);
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

/** Video id, playlist and start time of a YouTube address, if it points at a video or playlist. */
export function parseYoutube(raw: string): { id: string | null; list: string | null; start: number; short: boolean } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return null;
  let id: string | null = null;
  let short = false;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else {
    const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]+)/);
    if (m) {
      id = m[2];
      short = m[1] === 'shorts';
    } else if (url.pathname === '/watch') id = url.searchParams.get('v');
  }
  if (id && !YT_ID.test(id)) id = null;
  const listRaw = url.searchParams.get('list');
  const list = listRaw && /^[\w-]{10,64}$/.test(listRaw) ? listRaw : null;
  if (!id && !list) return null;
  return { id, list, start: parseStart(url.searchParams.get('t') ?? url.searchParams.get('start')), short };
}

/** Design id and share token of a Canva design address. */
export function parseCanva(raw: string): { id: string; token: string | null } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname.replace(/^www\./, '') !== 'canva.com') return null;
  const m = url.pathname.match(/^\/design\/([\w-]{6,})(?:\/([\w-]{6,}))?/);
  if (!m) return null;
  const token = m[2] && !/^(edit|view|watch|present)$/.test(m[2]) ? m[2] : null;
  return { id: m[1], token };
}

/** The page Canva shows inside an iframe for a design shared publicly. */
export const canvaEmbedUrl = (c: { id: string; token: string | null }) =>
  `https://www.canva.com/design/${c.id}${c.token ? `/${c.token}` : ''}/view?embed`;

const LABELS: Record<LinkProviderId, string> = {
  'google-slides': 'Google Slides',
  'google-docs': 'Google Docs',
  'google-sheets': 'Google Sheets',
  'google-drive': 'Google Drive',
  youtube: 'YouTube',
  canva: 'Canva',
  figma: 'Figma',
  notion: 'Notion',
  onedrive: 'OneDrive',
  github: 'GitHub',
  web: 'Trang web',
};

/** True for an absolute http(s) URL. */
export function isWebUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function detectLinkProvider(raw: string): LinkProvider {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { id: 'web', label: LABELS.web, host: raw, embedUrl: null, ratio: 16 / 9 };
  }
  const host = url.hostname.replace(/^www\./, '');
  const make = (id: LinkProviderId, embedUrl: string | null, ratio = 16 / 9): LinkProvider => ({
    id,
    label: LABELS[id],
    host,
    embedUrl,
    ratio,
  });

  if (host === 'docs.google.com') {
    const m = url.pathname.match(/^\/(presentation|document|spreadsheets)\/d\/([\w-]+)/);
    if (m) {
      const [, kind, fileId] = m;
      if (kind === 'presentation') {
        return make('google-slides', `https://docs.google.com/presentation/d/${fileId}/embed?start=false&loop=false`, 16 / 9.6);
      }
      if (kind === 'document') return make('google-docs', `https://docs.google.com/document/d/${fileId}/preview`, 1 / 1.3);
      return make('google-sheets', `https://docs.google.com/spreadsheets/d/${fileId}/preview`, 4 / 3);
    }
  }
  if (host === 'drive.google.com') {
    const folderId = url.pathname.match(/\/folders\/([\w-]{10,})/)?.[1];
    if (folderId) {
      return { ...make('google-drive', `https://drive.google.com/embeddedfolderview?id=${folderId}#list`, 4 / 3), kind: 'folder', folderId };
    }
    const fileId = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get('id');
    return make('google-drive', fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null, 1 / 1.3);
  }
  if (/^(m\.|music\.)?youtube\.com$|^youtu\.be$|^youtube-nocookie\.com$/.test(host)) {
    const y = parseYoutube(raw);
    if (!y) return make('youtube', null);
    const q = new URLSearchParams({ rel: '0' });
    if (y.id && y.list) q.set('list', y.list);
    if (y.start) q.set('start', String(y.start));
    const embed = y.id
      ? `https://www.youtube-nocookie.com/embed/${y.id}?${q}`
      : `https://www.youtube-nocookie.com/embed/videoseries?list=${y.list}&rel=0`;
    return {
      ...make('youtube', embed, y.short ? 9 / 16 : 16 / 9),
      kind: y.short ? 'short' : y.id ? 'video' : 'playlist',
      thumbnailUrl: y.id ? `https://i.ytimg.com/vi/${y.id}/hqdefault.jpg` : null,
    };
  }
  if (host === 'canva.link') return { ...make('canva', null), kind: 'design', needsResolve: true };
  if (host === 'canva.com') {
    const c = parseCanva(raw);
    if (c) return { ...make('canva', canvaEmbedUrl(c)), kind: 'design' };
  }
  if (host === 'figma.com') {
    return make('figma', `https://www.figma.com/embed?embed_host=kaned&url=${encodeURIComponent(raw)}`);
  }
  if (host.endsWith('notion.site') || host === 'notion.so') return make('notion', null);
  if (host === 'onedrive.live.com' || host === '1drv.ms' || host.endsWith('sharepoint.com')) return make('onedrive', null);
  if (host === 'github.com') return make('github', null);
  return make('web', null);
}

/** What the API found out about a YouTube or Canva link before it is posted. */
export interface LinkPreviewDto {
  /** The address to save: short links (canva.link) followed to the design. */
  url: string;
  provider: LinkProvider;
  title: string | null;
  /** Channel or designer name. */
  author: string | null;
  thumbnailUrl: string | null;
  /**
   * ok: shows inside Kaned. private: the owner has to share it publicly
   * (private video, embedding turned off, Canva design not public).
   * missing: no such video or design. unknown: could not be checked.
   */
  status: 'ok' | 'private' | 'missing' | 'unknown';
}

/** Hosts the API will look up for a preview; anything else is answered from the address alone. */
export const isPreviewableLink = (raw: string) => {
  const p = detectLinkProvider(raw);
  return p.id === 'youtube' || p.id === 'canva';
};

/** Links an internal document never shows to viewers, whatever the download setting. */
export const isAlwaysHiddenLink = (raw: string) => {
  const id = detectLinkProvider(raw).id;
  return id === 'youtube' || id === 'canva';
};

/** "YouTube", "Canva", "Google Drive"… for a provider id. */
export const linkProviderLabel = (id: LinkProviderId) => LABELS[id];


/** One thing inside a Google Drive folder. */
export interface DriveEntryDto {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  /** MIME type when Google tells us, e.g. application/pdf. */
  mime: string | null;
  size: number | null;
  modifiedAt: string | null;
  /** Date as Drive printed it, when only that is known ("Nov 3, 2026"). */
  modifiedText?: string | null;
}

/** What is inside a public Google Drive folder. */
export interface DriveFolderDto {
  id: string;
  name: string | null;
  entries: DriveEntryDto[];
  /** ok, or private (not shared with "anyone with the link"), or unknown (Google could not be asked). */
  status: 'ok' | 'private' | 'unknown';
  truncated: boolean;
}
