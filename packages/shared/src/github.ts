/**
 * GitHub documents: a repository, a folder in it, a single file or a release.
 * The address alone says which, and from it the app builds the download
 * links (ZIP, raw file) and the git commands, so the uploader only pastes it.
 */

export type GithubKind = 'repo' | 'folder' | 'file' | 'release';

export interface GithubTarget {
  owner: string;
  repo: string;
  /** Branch, tag or commit written in the address; null means the default branch. */
  ref: string | null;
  /** Path inside the repository, '' for the root. */
  path: string;
  kind: GithubKind;
}

export const GITHUB_KIND_LABELS: Record<GithubKind, string> = {
  repo: 'Cả repo',
  folder: 'Thư mục',
  file: 'Tệp',
  release: 'Bản phát hành',
};

const NAME = /^[A-Za-z0-9_.-]+$/;

/** github.com/<these> are GitHub's own pages, not users. */
const RESERVED = new Set([
  'about', 'apps', 'codespaces', 'collections', 'enterprise', 'explore', 'features', 'issues', 'login', 'marketplace',
  'new', 'notifications', 'orgs', 'organizations', 'pricing', 'pulls', 'search', 'settings', 'site', 'sponsors',
  'topics', 'trending', 'users',
]);

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

/** Adds the https:// people often leave off when copying "github.com/…". */
export function normalizeGithubInput(raw: string): string {
  const text = raw.trim();
  return /^(www\.)?(github\.com|raw\.githubusercontent\.com)\//i.test(text) ? `https://${text}` : text;
}

/** Reads a github.com or raw.githubusercontent.com address; null when it is not one. */
export function parseGithubUrl(raw: string): GithubTarget | null {
  let url: URL;
  try {
    url = new URL(normalizeGithubInput(raw));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean).map(decode);

  if (host === 'raw.githubusercontent.com') {
    let [owner, repo, ref, ...rest] = parts;
    if (ref === 'refs' && (rest[0] === 'heads' || rest[0] === 'tags')) [ref, ...rest] = rest.slice(1);
    if (!owner || !repo || !ref || !rest.length || !NAME.test(owner) || !NAME.test(repo)) return null;
    return { owner, repo, ref, path: rest.join('/'), kind: 'file' };
  }
  if (host !== 'github.com') return null;

  const [owner, repoRaw, section, ...rest] = parts;
  if (!owner || !repoRaw || RESERVED.has(owner.toLowerCase())) return null;
  const repo = repoRaw.replace(/\.git$/i, '');
  if (!NAME.test(owner) || !NAME.test(repo)) return null;

  if (section === 'tree' || section === 'blob' || section === 'raw') {
    const [ref, ...path] = rest;
    const p = path.join('/');
    if (!ref) return { owner, repo, ref: null, path: '', kind: 'repo' };
    if (!p) return { owner, repo, ref, path: '', kind: 'repo' };
    return { owner, repo, ref, path: p, kind: section === 'tree' ? 'folder' : 'file' };
  }
  if (section === 'releases') {
    const tag = rest[0] === 'tag' && rest[1] ? rest[1] : null;
    return { owner, repo, ref: tag, path: '', kind: 'release' };
  }
  // Any other page of the repository (issues, wiki, commits…) stands for the repository.
  return { owner, repo, ref: null, path: '', kind: 'repo' };
}

const seg = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export const githubRepoUrl = (t: Pick<GithubTarget, 'owner' | 'repo'>) => `https://github.com/${t.owner}/${t.repo}`;

/** "owner/repo" */
export const githubSlug = (t: Pick<GithubTarget, 'owner' | 'repo'>) => `${t.owner}/${t.repo}`;

/** The page on GitHub for this target. */
export function githubPageUrl(t: GithubTarget, ref = t.ref): string {
  const base = githubRepoUrl(t);
  if (t.kind === 'release') return t.ref ? `${base}/releases/tag/${encodeURIComponent(t.ref)}` : `${base}/releases`;
  if (t.kind === 'file') return `${base}/blob/${seg(ref ?? 'HEAD')}/${seg(t.path)}`;
  if (t.kind === 'folder') return `${base}/tree/${seg(ref ?? 'HEAD')}/${seg(t.path)}`;
  return ref ? `${base}/tree/${seg(ref)}` : base;
}

/** The whole repository as a ZIP, at a branch, tag or commit (default branch when null). */
export const githubZipUrl = (t: Pick<GithubTarget, 'owner' | 'repo'>, ref: string | null) =>
  `${githubRepoUrl(t)}/archive/${ref ? seg(ref) : 'HEAD'}.zip`;

/** One file's raw content. */
export const githubRawUrl = (t: Pick<GithubTarget, 'owner' | 'repo'>, path: string, ref: string | null) =>
  `https://raw.githubusercontent.com/${t.owner}/${t.repo}/${seg(ref ?? 'HEAD')}/${seg(path)}`;

/** The folder or file's own name, or the repository's. */
export const githubTargetName = (t: GithubTarget) => (t.path ? (t.path.split('/').pop() ?? t.repo) : t.repo);

/** Commands that fetch the target with git: the folder alone when it is one. */
export function githubCommands(t: GithubTarget, ref: string | null): string[] {
  const remote = `${githubRepoUrl(t)}.git`;
  const branch = ref && !/^[0-9a-f]{40}$/i.test(ref) ? ` --branch ${ref}` : '';
  if (t.kind === 'folder') {
    return [
      `git clone --depth 1 --filter=blob:none --sparse${branch} ${remote}`,
      `cd ${t.repo}`,
      `git sparse-checkout set "${t.path}"`,
    ];
  }
  return [`git clone --depth 1${branch} ${remote}`];
}
