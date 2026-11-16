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
}

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
    const fileId = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get('id');
    return make('google-drive', fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null, 1 / 1.3);
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const videoId =
      host === 'youtu.be'
        ? url.pathname.slice(1)
        : (url.searchParams.get('v') ?? url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/)?.[1] ?? null);
    return make('youtube', videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null);
  }
  if (host === 'canva.com' && url.pathname.startsWith('/design/')) {
    const path = url.pathname.replace(/\/(edit|view)\/?$/, '');
    return make('canva', `https://www.canva.com${path}/view?embed`);
  }
  if (host === 'figma.com') {
    return make('figma', `https://www.figma.com/embed?embed_host=kaned&url=${encodeURIComponent(raw)}`);
  }
  if (host.endsWith('notion.site') || host === 'notion.so') return make('notion', null);
  if (host === 'onedrive.live.com' || host === '1drv.ms' || host.endsWith('sharepoint.com')) return make('onedrive', null);
  if (host === 'github.com') return make('github', null);
  return make('web', null);
}
