import { useQuery } from '@tanstack/react-query';
import { githubRawUrl, githubSlug, type GithubTarget } from '@kaned/shared';

/**
 * Reads public repositories straight from the GitHub API in the browser.
 * Unsigned requests are limited to 60 an hour per visitor, so answers are
 * kept for half an hour and a refusal never blocks the page.
 */

export interface GithubRepo {
  slug: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  forks: number;
  pushedAt: string;
  license: string | null;
  ownerAvatar: string;
  archived: boolean;
}

export interface GithubEntry {
  path: string;
  type: 'blob' | 'tree';
  size: number;
}

export interface GithubTree {
  ref: string;
  entries: GithubEntry[];
  truncated: boolean;
}

export interface GithubRelease {
  tag: string;
  name: string;
  publishedAt: string | null;
  assets: Array<{ name: string; size: number; url: string; downloads: number }>;
  zipUrl: string;
}

/** missing: 404, the repository is private or the address is wrong. limited: out of free requests. */
export class GithubError extends Error {
  constructor(public kind: 'missing' | 'limited' | 'offline') {
    super(kind);
  }
}

const TTL = 30 * 60_000;
const API = 'https://api.github.com';

function cached<T>(key: string): T | undefined {
  try {
    const hit = JSON.parse(sessionStorage.getItem(`gh:${key}`) ?? 'null') as { at: number; value: T } | null;
    if (hit && Date.now() - hit.at < TTL) return hit.value;
  } catch {
    /* storage unavailable */
  }
  return undefined;
}

function keep(key: string, value: unknown) {
  try {
    sessionStorage.setItem(`gh:${key}`, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* full or unavailable: the in-memory query cache still has it */
  }
}

async function gh<T>(path: string): Promise<T> {
  const hit = cached<T>(path);
  if (hit) return hit;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw new GithubError('offline');
  }
  if (res.status === 404 || res.status === 451) throw new GithubError('missing');
  if (res.status === 403 || res.status === 429) throw new GithubError('limited');
  if (!res.ok) throw new GithubError('offline');
  const value = (await res.json()) as T;
  keep(path, value);
  return value;
}

const queryDefaults = {
  staleTime: TTL,
  gcTime: TTL,
  retry: (n: number, e: unknown) => !(e instanceof GithubError && e.kind !== 'offline') && n < 1,
} as const;

export function useGithubRepo(target: GithubTarget | null) {
  return useQuery({
    queryKey: ['github', 'repo', target && githubSlug(target).toLowerCase()],
    enabled: Boolean(target),
    ...queryDefaults,
    queryFn: async (): Promise<GithubRepo> => {
      const r = await gh<{
        full_name: string;
        description: string | null;
        default_branch: string;
        stargazers_count: number;
        forks_count: number;
        pushed_at: string;
        archived: boolean;
        license: { spdx_id: string; name: string } | null;
        owner: { avatar_url: string };
      }>(`/repos/${githubSlug(target!)}`);
      return {
        slug: r.full_name,
        description: r.description,
        defaultBranch: r.default_branch,
        stars: r.stargazers_count,
        forks: r.forks_count,
        pushedAt: r.pushed_at,
        license: r.license && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
        ownerAvatar: r.owner.avatar_url,
        archived: r.archived,
      };
    },
  });
}

/** Every file in the repository at a ref; callers narrow it to their folder. */
export function useGithubTree(target: GithubTarget | null, ref: string | null | undefined) {
  return useQuery({
    queryKey: ['github', 'tree', target && githubSlug(target).toLowerCase(), ref],
    enabled: Boolean(target && ref && target.kind !== 'release'),
    ...queryDefaults,
    queryFn: async (): Promise<GithubTree> => {
      const r = await gh<{ tree: Array<{ path: string; type: string; size?: number }>; truncated: boolean }>(
        `/repos/${githubSlug(target!)}/git/trees/${encodeURIComponent(ref!)}?recursive=1`,
      );
      return {
        ref: ref!,
        truncated: r.truncated,
        entries: r.tree
          .filter((e) => e.type === 'blob' || e.type === 'tree')
          .map((e) => ({ path: e.path, type: e.type as 'blob' | 'tree', size: e.size ?? 0 })),
      };
    },
  });
}

export function useGithubRelease(target: GithubTarget | null) {
  return useQuery({
    queryKey: ['github', 'release', target && githubSlug(target).toLowerCase(), target?.ref],
    enabled: target?.kind === 'release',
    ...queryDefaults,
    queryFn: async (): Promise<GithubRelease> => {
      const t = target!;
      const r = await gh<{
        tag_name: string;
        name: string | null;
        published_at: string | null;
        zipball_url: string;
        assets: Array<{ name: string; size: number; browser_download_url: string; download_count: number }>;
      }>(`/repos/${githubSlug(t)}/releases/${t.ref ? `tags/${encodeURIComponent(t.ref)}` : 'latest'}`);
      return {
        tag: r.tag_name,
        name: r.name || r.tag_name,
        publishedAt: r.published_at,
        zipUrl: `https://github.com/${githubSlug(t)}/archive/refs/tags/${encodeURIComponent(r.tag_name)}.zip`,
        assets: r.assets.map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url, downloads: a.download_count })),
      };
    },
  });
}

/** The files at or under `path` ('' is the whole repository), paths kept relative to the repository. */
export function filesUnder(tree: GithubTree, path: string): GithubEntry[] {
  if (!path) return tree.entries;
  const prefix = `${path}/`;
  return tree.entries.filter((e) => e.path === path || e.path.startsWith(prefix));
}

export const totalBytes = (entries: GithubEntry[]) => entries.reduce((sum, e) => sum + (e.type === 'blob' ? e.size : 0), 0);

/** The browser gathers a folder into one ZIP; past these it is quicker to take the repository ZIP. */
export const FOLDER_ZIP_LIMITS = { files: 800, bytes: 150 * 1024 * 1024 };

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Fetches one file and saves it under its own name. */
export async function downloadGithubFile(target: GithubTarget, path: string, ref: string | null) {
  const res = await fetch(githubRawUrl(target, path, ref));
  if (!res.ok) throw new GithubError(res.status === 404 ? 'missing' : 'offline');
  save(await res.blob(), path.split('/').pop() || 'file');
}

/**
 * Fetches every file in a folder and saves them as `<folder>.zip`, keeping the
 * folder's own name as the top directory. Reports progress from 0 to 1.
 */
export async function zipGithubFolder(target: GithubTarget, folder: string, ref: string, files: GithubEntry[], onProgress: (share: number) => void) {
  const { zip } = await import('fflate');
  const blobs = files.filter((f) => f.type === 'blob');
  const total = Math.max(1, totalBytes(blobs));
  const root = folder.split('/').pop() || target.repo;
  const cut = folder ? folder.length + 1 : 0;
  const out: Record<string, Uint8Array> = {};
  let done = 0;
  let next = 0;
  onProgress(0);

  const worker = async () => {
    while (next < blobs.length) {
      const file = blobs[next++];
      const res = await fetch(githubRawUrl(target, file.path, ref));
      if (!res.ok) throw new GithubError(res.status === 404 ? 'missing' : 'offline');
      out[`${root}/${file.path.slice(cut)}`] = new Uint8Array(await res.arrayBuffer());
      done += file.size;
      onProgress(Math.min(0.97, done / total));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, blobs.length) }, worker));

  const data = await new Promise<Uint8Array>((resolve, reject) => zip(out, { level: 1 }, (err, result) => (err ? reject(err) : resolve(result))));
  onProgress(1);
  save(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `${root}.zip`);
}
