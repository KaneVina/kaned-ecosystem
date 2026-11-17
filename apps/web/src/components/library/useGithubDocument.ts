import { useCallback, useMemo, useState } from 'react';
import { githubPageUrl, githubRawUrl, githubZipUrl, parseGithubUrl, type DocumentDetailDto, type GithubTarget } from '@kaned/shared';
import {
  downloadGithubFile,
  filesUnder,
  FOLDER_ZIP_LIMITS,
  totalBytes,
  useGithubRelease,
  useGithubRepo,
  useGithubTree,
  zipGithubFolder,
} from '@/lib/github';
import { useToast } from '@/providers/ToastProvider';
import { fmtBytes, fmtInt } from '@/lib/format';

/** A GitHub document: the GITHUB format, or an older plain link that points at GitHub. */
export function githubTargetOf(doc: Pick<DocumentDetailDto, 'format' | 'fileUrl'> | null | undefined): GithubTarget | null {
  if (!doc || (doc.format !== 'GITHUB' && doc.format !== 'LINK')) return null;
  return parseGithubUrl(doc.fileUrl);
}

function openUrl(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Everything the document page needs for a GitHub document: what is there,
 * and the download that suits it. `onCount` records a download on Kaned.
 */
export function useGithubDocument(doc: Pick<DocumentDetailDto, 'format' | 'fileUrl'> | null | undefined, onCount: () => void) {
  const toast = useToast();
  const target = useMemo(() => githubTargetOf(doc), [doc]);
  const repo = useGithubRepo(target);
  const ref = target?.ref ?? repo.data?.defaultBranch ?? null;
  const tree = useGithubTree(target, ref);
  const release = useGithubRelease(target);
  /** The path being downloaded and how far along it is (0–1). */
  const [job, setJob] = useState<{ path: string; share: number } | null>(null);

  const files = useMemo(() => (tree.data && target ? filesUnder(tree.data, target.path) : null), [tree.data, target]);
  const blobs = useMemo(() => files?.filter((f) => f.type === 'blob') ?? [], [files]);

  const zipFolder = useCallback(
    async (path: string) => {
      if (!target || job) return;
      onCount();
      const entries = tree.data ? filesUnder(tree.data, path).filter((f) => f.type === 'blob') : null;
      const tooBig = entries && (entries.length > FOLDER_ZIP_LIMITS.files || totalBytes(entries) > FOLDER_ZIP_LIMITS.bytes);
      if (!entries || !entries.length || tooBig || !ref) {
        toast.info(
          'Tải cả repo thay cho thư mục',
          tooBig ? `Thư mục lớn (${fmtInt(entries!.length)} tệp), GitHub tải nhanh hơn.` : `Thư mục nằm ở ${path} bên trong file ZIP.`,
        );
        openUrl(githubZipUrl(target, ref));
        return;
      }
      setJob({ path, share: 0 });
      try {
        await zipGithubFolder(target, path, ref, entries, (share) => setJob({ path, share }));
        toast.success('Đã tải thư mục', `${path.split('/').pop()}.zip · ${fmtInt(entries.length)} tệp`);
      } catch {
        toast.error('Không gom được thư mục', 'Đang mở bản ZIP của cả repo thay thế.');
        openUrl(githubZipUrl(target, ref));
      } finally {
        setTimeout(() => setJob(null), 600);
      }
    },
    [target, job, onCount, tree.data, ref, toast],
  );

  const downloadFile = useCallback(
    async (path: string) => {
      if (!target || job) return;
      onCount();
      setJob({ path, share: 0.5 });
      try {
        await downloadGithubFile(target, path, ref);
      } catch {
        window.open(githubRawUrl(target, path, ref), '_blank', 'noopener');
      } finally {
        setTimeout(() => setJob(null), 400);
      }
    },
    [target, job, onCount, ref],
  );

  const downloadRepo = useCallback(() => {
    if (!target) return;
    onCount();
    openUrl(githubZipUrl(target, ref));
  }, [target, ref, onCount]);

  /** The one action the page leads with. */
  const primary = useMemo(() => {
    if (!target) return null;
    const name = target.path.split('/').pop() ?? target.repo;
    if (target.kind === 'file') {
      return { label: 'Tải tệp', sub: blobs[0] ? fmtBytes(blobs[0].size) : name, run: () => downloadFile(target.path) };
    }
    if (target.kind === 'folder') {
      return { label: 'Tải thư mục (.zip)', sub: files ? `${fmtInt(blobs.length)} tệp` : '', run: () => zipFolder(target.path) };
    }
    if (target.kind === 'release') {
      const only = release.data?.assets.length === 1 ? release.data.assets[0] : null;
      return only
        ? { label: 'Tải bản phát hành', sub: fmtBytes(only.size), run: () => (onCount(), openUrl(only.url)) }
        : { label: 'Mở bản phát hành', sub: '', run: () => window.open(githubPageUrl(target), '_blank', 'noopener') };
    }
    return { label: 'Tải repo (.zip)', sub: '', run: downloadRepo };
  }, [target, blobs, files, release.data, downloadFile, zipFolder, downloadRepo, onCount]);

  return { target, repo, ref, tree, release, files, blobs, job, zipFolder, downloadFile, downloadRepo, primary };
}

export type GithubDocument = ReturnType<typeof useGithubDocument>;
